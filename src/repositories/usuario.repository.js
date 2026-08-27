const db = require('../config/db');

class UsuarioRepository {
    async findByEmail(email) {
        const queryText = `
            SELECT u.*, r.nombre as rol 
            FROM usuarios u
            JOIN roles r ON u.rol_id = r.id
            WHERE u.email = $1
        `;
        const res = await db.query(queryText, [email]);
        return res.rows[0];
    }

    async create(usuario, client = db) {
        const queryText = `
            INSERT INTO usuarios (email, password_hash, rol_id, nombre, telefono)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, email, rol_id, nombre, telefono, created_at
        `;
        const params = [
            usuario.email,
            usuario.password_hash,
            usuario.rol_id,
            usuario.nombre,
            usuario.telefono || null
        ];
        const res = await client.query(queryText, params);
        return res.rows[0];
    }
}

module.exports = new UsuarioRepository();
