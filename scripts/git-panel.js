const express = require('express');
const { exec, spawn } = require('child_process');
const path = require('path');

// 🛡️ Bloqueo de seguridad: Evitar ejecución en producción (Render)
if (process.env.NODE_ENV === 'production') {
    console.error('❌ ERROR DE SEGURIDAD: El Panel de Despliegue Local no se puede ejecutar en producción.');
    process.exit(1);
}

const app = express();
const PORT = 3099;

app.use(express.json());

// Servir la página web del Panel de Despliegue
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AviPerú - Panel de Despliegue Local</title>
    <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;800&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
        :root {
            --bg-color: #0f172a;
            --card-bg: #1e293b;
            --text-color: #e2e8f0;
            --primary: #2563eb;
            --primary-hover: #1d4ed8;
            --success: #10b981;
            --warning: #f59e0b;
            --terminal-bg: #020617;
        }
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: 'Barlow', sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            padding: 40px 20px;
            display: flex;
            justify-content: center;
        }
        .container {
            width: 100%;
            max-width: 900px;
        }
        header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 30px;
            border-bottom: 2px solid var(--card-bg);
            padding-bottom: 20px;
        }
        h1 {
            font-size: 24px;
            font-weight: 800;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        h1 span {
            font-size: 28px;
        }
        .badge {
            background-color: var(--success);
            color: white;
            font-size: 11px;
            font-weight: 600;
            padding: 4px 10px;
            border-radius: 50px;
            text-transform: uppercase;
        }
        .card {
            background-color: var(--card-bg);
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
            margin-bottom: 24px;
        }
        .btn-group {
            display: flex;
            gap: 12px;
            margin-bottom: 20px;
        }
        button {
            padding: 12px 24px;
            font-family: 'Barlow', sans-serif;
            font-size: 14px;
            font-weight: 600;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s;
        }
        .btn-secondary {
            background-color: #334155;
            color: white;
        }
        .btn-secondary:hover {
            background-color: #475569;
        }
        .btn-primary {
            background-color: var(--primary);
            color: white;
        }
        .btn-primary:hover {
            background-color: var(--primary-hover);
        }
        .btn-primary:disabled {
            background-color: #64748b;
            cursor: not-allowed;
        }
        input[type="text"] {
            width: 100%;
            padding: 12px;
            border-radius: 8px;
            border: 1px solid #475569;
            background-color: var(--bg-color);
            color: white;
            font-family: 'Barlow', sans-serif;
            font-size: 14px;
            margin-bottom: 20px;
            outline: none;
        }
        input[type="text"]:focus {
            border-color: var(--primary);
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            font-size: 13px;
            color: #94a3b8;
        }
        .terminal-container {
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
        }
        .terminal-header {
            background-color: #1e293b;
            padding: 12px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid #334155;
        }
        .terminal-title {
            font-family: 'Fira Code', monospace;
            font-size: 12px;
            color: #94a3b8;
        }
        .terminal-dots {
            display: flex;
            gap: 6px;
        }
        .dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
        }
        .dot-red { background-color: #ef4444; }
        .dot-yellow { background-color: #f59e0b; }
        .dot-green { background-color: #10b981; }
        .terminal-body {
            background-color: var(--terminal-bg);
            color: #10b981;
            font-family: 'Fira Code', monospace;
            font-size: 13px;
            padding: 20px;
            min-height: 350px;
            max-height: 500px;
            overflow-y: auto;
            white-space: pre-wrap;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1><span>🦜</span> AviPerú / LPR - Panel de Despliegue Local</h1>
            <span class="badge">Local Environment</span>
        </header>

        <div class="card">
            <div class="btn-group">
                <button class="btn-secondary" onclick="checkStatus()"><i class="fas fa-sync"></i> Verificar Cambios</button>
            </div>
            
            <label for="commit-msg">Comentario del despliegue (Commit message):</label>
            <input type="text" id="commit-msg" placeholder="Actualización automática de archivos modificados...">

            <button class="btn-primary" id="btn-deploy" onclick="startDeploy()"><i class="fas fa-rocket"></i> Subir a Producción (GitHub / Render)</button>
        </div>

        <div class="terminal-container">
            <div class="terminal-header">
                <span class="terminal-title">lpr-deploy-console.log</span>
                <div class="terminal-dots">
                    <div class="dot dot-red"></div>
                    <div class="dot dot-yellow"></div>
                    <div class="dot dot-green"></div>
                </div>
            </div>
            <div class="terminal-body" id="console-output">> Presione "Verificar Cambios" para ver el estado local actual...</div>
        </div>
    </div>

    <script>
        const consoleOutput = document.getElementById('console-output');
        const btnDeploy = document.getElementById('btn-deploy');
        const commitInput = document.getElementById('commit-msg');

        function appendLog(text) {
            consoleOutput.textContent += text;
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        }

        function clearLog() {
            consoleOutput.textContent = '';
        }

        async function checkStatus() {
            clearLog();
            appendLog('> Ejecutando git status...\\n');
            try {
                const res = await fetch('/api/status');
                const data = await res.json();
                if (data.success) {
                    appendLog(data.output);
                } else {
                    appendLog('❌ Error: ' + data.error);
                }
            } catch (err) {
                appendLog('❌ Error de red: ' + err.message);
            }
        }

        function startDeploy() {
            const message = commitInput.value.trim() || 'Actualización automática desde Panel Local';
            clearLog();
            appendLog('> Iniciando proceso de despliegue...\\n');
            btnDeploy.disabled = true;

            const eventSource = new EventSource(\`/api/deploy-stream?message=\${encodeURIComponent(message)}\`);

            eventSource.onmessage = function(event) {
                const data = JSON.parse(event.data);
                if (data.log) {
                    appendLog(data.log);
                }
                if (data.done) {
                    eventSource.close();
                    btnDeploy.disabled = false;
                    if (data.success) {
                        appendLog('\\n✅ ' + data.message + '\\n');
                    } else {
                        appendLog('\\n❌ Error en el despliegue: ' + data.error + '\\n');
                    }
                }
            };

            eventSource.onerror = function() {
                eventSource.close();
                btnDeploy.disabled = false;
                appendLog('\\n❌ Conexión con el servidor perdida.\\n');
            };
        }
    </script>
</body>
</html>
    `);
});

// Función para traducir los mensajes más comunes de Git al español
function translateGitStatus(output) {
    if (!output) return '';
    let translated = output;
    
    const translations = [
        { regex: /On branch main/gi, replacement: '📍 En la rama main (Producción)' },
        { regex: /On branch master/gi, replacement: '📍 En la rama master (Producción)' },
        { regex: /Your branch is up to date with 'origin\/main'\./gi, replacement: '✔ Tu código local está sincronizado con la versión en la nube (origin/main).' },
        { regex: /Your branch is up to date with 'origin\/master'\./gi, replacement: '✔ Tu código local está sincronizado con la versión en la nube (origin/master).' },
        { regex: /nothing to commit, working tree clean/gi, replacement: '✅ Todo está al día. No hay ningún archivo pendiente de subir.' },
        { regex: /Changes not staged for commit:/gi, replacement: '📝 Archivos modificados pendientes de subir:' },
        { regex: /Untracked files:/gi, replacement: '📁 Archivos nuevos detectados:' },
        { regex: /modified:/gi, replacement: '   [Modificado] ' },
        { regex: /deleted:/gi, replacement: '   [Eliminado]  ' },
        { regex: /new file:/gi, replacement: '   [Nuevo]      ' },
        { regex: /use "git add.*?\n/gi, replacement: '' },
        { regex: /use "git restore.*?\n/gi, replacement: '' },
        { regex: /\(use "git.*?\n/gi, replacement: '' },
        { regex: /no changes added to commit.*/gi, replacement: '' }
    ];
    
    translations.forEach(t => {
        translated = translated.replace(t.regex, t.replacement);
    });
    
    return translated.trim();
}

// API: Obtener estado local de Git
app.get('/api/status', (req, res) => {
    exec('git status', (err, stdout, stderr) => {
        if (err && !stdout) {
            return res.json({ success: false, error: stderr || err.message });
        }
        const rawOutput = stdout || stderr;
        res.json({ success: true, output: translateGitStatus(rawOutput) });
    });
});

// API: Stream de Despliegue en tiempo real (SSE)
app.get('/api/deploy-stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const message = req.query.message || 'Actualización automática desde Panel Local';

    const sendLog = (data) => {
        res.write(`data: ${JSON.stringify({ log: data })}\n\n`);
    };

    const runCommand = (cmd, args) => {
        return new Promise((resolve, reject) => {
            sendLog(`\n$ ${cmd} ${args.join(' ')}\n`);
            const child = spawn(cmd, args, { shell: true, cwd: path.join(__dirname, '..') });

            child.stdout.on('data', (data) => {
                sendLog(data.toString());
            });

            child.stderr.on('data', (data) => {
                sendLog(data.toString());
            });

            child.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`El comando falló con código ${code}`));
                }
            });
        });
    };

    (async () => {
        try {
            // 1. git add .
            await runCommand('git', ['add', '.']);
            
            // 2. git commit -m
            await runCommand('git', ['commit', '-m', `"${message}"`]);
            
            // 3. git push origin main
            await runCommand('git', ['push', 'origin', 'main']);

            res.write(`data: ${JSON.stringify({ done: true, success: true, message: '¡Despliegue completado y enviado a GitHub/Render con éxito!' })}\n\n`);
        } catch (err) {
            res.write(`data: ${JSON.stringify({ done: true, success: false, error: err.message })}\n\n`);
        } finally {
            res.end();
        }
    })();
});

app.listen(PORT, '127.0.0.1', () => {
    console.log('\n======================================================');
    console.log('🚀 [LPR / AVIPERÚ DEPLOY PANEL] Iniciado con éxito.');
    console.log(`💻 Accede desde tu navegador en: http://localhost:${PORT}`);
    console.log('======================================================\n');
});
