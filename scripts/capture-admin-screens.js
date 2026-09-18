const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\41636428\\.gemini\\antigravity\\brain\\757139d8-a305-45c4-b9db-bada28b38772';
const DEBUG_PORT = 9222;

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

function postLogin(data) {
    return new Promise((resolve, reject) => {
        const req = http.request('http://localhost:3010/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(data)
            }
        }, (res) => {
            resolve(res.headers['set-cookie'] || []);
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

class CDPClient {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.id = 1;
        this.callbacks = new Map();
        
        this.ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.id && this.callbacks.has(msg.id)) {
                const { resolve, reject } = this.callbacks.get(msg.id);
                this.callbacks.delete(msg.id);
                if (msg.error) {
                    reject(new Error(msg.error.message));
                } else {
                    resolve(msg.result);
                }
            }
        };
    }

    ready() {
        return new Promise((resolve, reject) => {
            if (this.ws.readyState === WebSocket.OPEN) return resolve();
            this.ws.onopen = () => resolve();
            this.ws.onerror = reject;
        });
    }

    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = this.id++;
            this.callbacks.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    close() {
        this.ws.close();
    }
}

async function main() {
    console.log('Obteniendo cookie de sesión como admin...');
    const cookies = await postLogin('email=admin%40lpr.com&password=admin123');
    if (!cookies.length) {
        throw new Error('No se recibió cookie de sesión');
    }
    
    // Cookie format: connect.sid=s%3A...; Path=/; HttpOnly
    const rawCookie = cookies[0];
    const match = rawCookie.match(/^([^=]+)=([^;]+)/);
    const cookieName = match[1];
    const cookieValue = match[2];
    console.log(`Cookie obtenida: ${cookieName}=${cookieValue.substring(0, 15)}...`);

    console.log('Iniciando Chrome Headless...');
    const chrome = spawn(CHROME_PATH, [
        '--headless=new',
        `--remote-debugging-port=${DEBUG_PORT}`,
        '--window-size=1440,960',
        '--disable-gpu',
        '--no-sandbox',
        'about:blank'
    ]);

    let connected = false;
    for (let i = 0; i < 20; i++) {
        await sleep(500);
        try {
            const targets = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
            if (targets && targets.length > 0) {
                connected = true;
                break;
            }
        } catch (e) {}
    }

    if (!connected) {
        chrome.kill();
        throw new Error('No se pudo conectar a Chrome DevTools');
    }

    const targets = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await client.ready();

    console.log('Conectado a CDP.');
    await client.send('Page.enable');
    await client.send('Network.enable');
    await client.send('DOM.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 1024,
        deviceScaleFactor: 1,
        mobile: false
    });

    // Inyectar cookie directamente en Chrome para localhost:3010
    console.log('Inyectando cookie en Chrome...');
    await client.send('Network.setCookie', {
        name: cookieName,
        value: cookieValue,
        url: 'http://localhost:3010',
        domain: 'localhost',
        path: '/',
        httpOnly: true
    });

    const pagesToCapture = [
        { name: 'admin_dashboard.png', url: 'http://localhost:3010/admin', title: 'Dashboard Administrativo' },
        { name: 'admin_categorias.png', url: 'http://localhost:3010/admin/categorias', title: 'Gestión de Categorías' },
        { name: 'admin_ventas.png', url: 'http://localhost:3010/admin/ventas', title: 'Gestión de Ventas y Pedidos' },
        { name: 'admin_detalle_venta.png', url: 'http://localhost:3010/admin/ventas/1', title: 'Detalle de Pedido #LPR-2026-84920' },
        { name: 'admin_productos.png', url: 'http://localhost:3010/admin/productos', title: 'Inventario de Productos & Kits' }
    ];

    for (const p of pagesToCapture) {
        console.log(`Capturando ${p.title} (${p.url})...`);
        await client.send('Page.navigate', { url: p.url });
        await sleep(2500);

        const screenshot = await client.send('Page.captureScreenshot', { 
            format: 'png',
            captureBeyondViewport: false
        });
        const filePath = path.join(ARTIFACTS_DIR, p.name);
        fs.writeFileSync(filePath, Buffer.from(screenshot.data, 'base64'));
        console.log(`✔ Guardado: ${p.name}`);
    }

    client.close();
    chrome.kill();
    console.log('Todas las capturas se completaron con éxito.');
}

main().catch(err => {
    console.error('Error en captura:', err);
    process.exit(1);
});
