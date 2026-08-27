const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const DB_NAME = 'db_lpr';

async function init() {
    console.log('🐘 Iniciando configuración de base de datos local...');

    const defaultClient = new Client({
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: ''
    });

    try {
        await defaultClient.connect();
        
        // 1. Eliminar base de datos anterior 'prompt_maestro' si existe (para limpiar)
        try {
            const resCheckOld = await defaultClient.query(
                "SELECT 1 FROM pg_database WHERE datname = 'prompt_maestro'"
            );
            if (resCheckOld.rows.length > 0) {
                console.log('DROP DATABASE: Eliminando base de datos obsoleta "prompt_maestro"...');
                await defaultClient.query('DROP DATABASE prompt_maestro');
                console.log('✔ Base de datos anterior eliminada.');
            }
        } catch (e) {
            console.log('ℹ No se pudo eliminar "prompt_maestro" (probablemente conexiones activas). continuando...');
        }

        // 2. Crear nueva base de datos 'db_lpr'
        const resCheck = await defaultClient.query(
            "SELECT 1 FROM pg_database WHERE datname = $1", 
            [DB_NAME]
        );

        if (resCheck.rows.length === 0) {
            console.log(`CREATE DATABASE: Creando base de datos "${DB_NAME}"...`);
            await defaultClient.query(`CREATE DATABASE ${DB_NAME}`);
            console.log(`✔ Base de datos "${DB_NAME}" creada.`);
        } else {
            console.log(`ℹ La base de datos "${DB_NAME}" ya existe.`);
        }
        await defaultClient.end();

    } catch (err) {
        console.error('❌ Error conectando a base de datos base (postgres):', err.message);
        process.exit(1);
    }

    const appClient = new Client({
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: '',
        database: DB_NAME
    });

    try {
        await appClient.connect();
        console.log(`🐘 Conectado a la base de datos "${DB_NAME}".`);

        console.log('📜 Leyendo e instalando schema.sql...');
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        await appClient.query(schemaSql);
        console.log('✔ Tablas, índices, triggers y funciones inicializadas.');

        console.log('🌱 Sembrando datos base...');
        await appClient.query('BEGIN');

        await appClient.query(`
            INSERT INTO roles (nombre) VALUES ('ADMIN'), ('CLIENTE') 
            ON CONFLICT (nombre) DO NOTHING
        `);
        console.log('  ✔ Roles sembrados.');

        await appClient.query(`
            INSERT INTO especies (nombre) VALUES ('Perico Australiano'), ('Perico Inglés') 
            ON CONFLICT (nombre) DO NOTHING
        `);
        console.log('  ✔ Especies sembradas.');

        const mutaciones = [
            ['Clásico / Ancestral', 'Color original verde o azul.'],
            ['Lutino', 'Amarillo con ojos rojos.'],
            ['Albino', 'Blanco con ojos rojos.'],
            ['Opalino', 'Patrón opalino en las alas.'],
            ['Arcoíris', 'Combinación multicolor.'],
            ['Pío Dominante', 'Manchas claras.'],
            ['Pío Recesivo', 'Manchas claras sin iris.'],
            ['Flavo', 'Cuerpo diluido con ojos rojos y marcas canela.']
        ];
        for (const [nombre, desc] of mutaciones) {
            await appClient.query(`
                INSERT INTO mutaciones (nombre, descripcion) VALUES ($1, $2) 
                ON CONFLICT (nombre) DO NOTHING
            `, [nombre, desc]);
        }
        console.log('  ✔ Mutaciones sembradas.');

        const email = 'admin@lpr.com';
        const password = 'admin123';
        const name = 'Administrador Principal';

        const resUser = await appClient.query('SELECT id FROM usuarios WHERE email = $1', [email]);
        if (resUser.rows.length === 0) {
            const passwordHash = await bcrypt.hash(password, 10);
            const resRole = await appClient.query("SELECT id FROM roles WHERE nombre = 'ADMIN'");
            const adminRoleId = resRole.rows[0].id;
            
            await appClient.query(`
                INSERT INTO usuarios (email, password_hash, rol_id, nombre) 
                VALUES ($1, $2, $3, $4)
            `, [email, passwordHash, adminRoleId, name]);
            console.log(`  ✔ Administrador creado: ${email} (clave: ${password})`);
        } else {
            console.log('  ℹ El Administrador ya existe.');
        }

        await appClient.query('COMMIT');
        console.log('✔ Sembrado de datos completado.');

        // Crear/Sobrescribir .env para apuntar a db_lpr
        const envPath = path.join(__dirname, '../.env');
        const envContent = `PORT=3010
DATABASE_URL=postgresql://postgres@localhost:5432/db_lpr
SESSION_SECRET=PROMPT_MAESTRO_SECURE_SESSION_SECRET_KEY_2026!
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-service-role-key
MAIL_HOST=smtp.gmail.com
MAIL_PORT=465
MAIL_USER=your-email@example.com
MAIL_PASS=your-app-password
MAIL_FROM=your-email@example.com
`;
        fs.writeFileSync(envPath, envContent, 'utf8');
        console.log('✔ Archivo .env configurado automáticamente.');

        console.log('🎉 Base de datos configurada e inicializada correctamente para desarrollo local.');

    } catch (err) {
        await appClient.query('ROLLBACK').catch(() => {});
        console.error('❌ Error configurando base de datos:', err.message);
    } finally {
        await appClient.end();
        process.exit();
    }
}

init();
