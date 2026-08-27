const db = require('../src/config/db');
const bcrypt = require('bcrypt');

async function seed() {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        
        console.log('🌱 Sembrando base de datos...');

        // 1. Roles
        await client.query(`
            INSERT INTO roles (nombre) VALUES ('ADMIN'), ('CLIENTE') 
            ON CONFLICT (nombre) DO NOTHING
        `);
        console.log('✔ Roles creados.');

        // 2. Especies
        await client.query(`
            INSERT INTO especies (nombre) VALUES ('Perico Australiano'), ('Perico Inglés') 
            ON CONFLICT (nombre) DO NOTHING
        `);
        console.log('✔ Especies creadas.');

        // 3. Mutaciones
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
            await client.query(`
                INSERT INTO mutaciones (nombre, descripcion) VALUES ($1, $2) 
                ON CONFLICT (nombre) DO NOTHING
            `, [nombre, desc]);
        }
        console.log('✔ Mutaciones creadas.');

        // 4. Crear Administrador
        const email = 'admin@promptmaestro.com';
        const password = 'admin123';
        const name = 'Administrador Principal';
        
        const resUser = await client.query('SELECT id FROM usuarios WHERE email = $1', [email]);
        if (resUser.rows.length === 0) {
            const passwordHash = await bcrypt.hash(password, 10);
            const resRole = await client.query("SELECT id FROM roles WHERE nombre = 'ADMIN'");
            const adminRoleId = resRole.rows[0].id;
            
            await client.query(`
                INSERT INTO usuarios (email, password_hash, rol_id, nombre) 
                VALUES ($1, $2, $3, $4)
            `, [email, passwordHash, adminRoleId, name]);
            console.log(`✔ Usuario administrador creado: ${email} / Contraseña: ${password}`);
        } else {
            console.log('ℹ Usuario administrador ya existe.');
        }

        await client.query('COMMIT');
        console.log('🌱 Sembrado completado con éxito.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error sembrando base de datos:', err);
    } finally {
        client.release();
        process.exit();
    }
}

seed();
