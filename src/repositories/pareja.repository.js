const db = require('../config/db');

class ParejaRepository {
    async create(pareja, client = db) {
        const queryText = `
            INSERT INTO parejas (
                macho_id, hembra_id, fecha_inicio, fecha_fin, jaula, nido, comentario, activo
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8
            ) RETURNING *
        `;
        const params = [
            pareja.macho_id,
            pareja.hembra_id,
            pareja.fecha_inicio,
            pareja.fecha_fin || null,
            pareja.jaula || null,
            pareja.nido || null,
            pareja.comentario || null,
            pareja.activo !== undefined ? pareja.activo : true
        ];
        const res = await client.query(queryText, params);
        return res.rows[0];
    }

    async update(id, pareja, client = db) {
        const queryText = `
            UPDATE parejas SET
                macho_id = $1,
                hembra_id = $2,
                fecha_inicio = $3,
                fecha_fin = $4,
                jaula = $5,
                nido = $6,
                comentario = $7,
                activo = $8
            WHERE id = $9
            RETURNING *
        `;
        const params = [
            pareja.macho_id,
            pareja.hembra_id,
            pareja.fecha_inicio,
            pareja.fecha_fin || null,
            pareja.jaula || null,
            pareja.nido || null,
            pareja.comentario || null,
            pareja.activo,
            id
        ];
        const res = await client.query(queryText, params);
        return res.rows[0];
    }

    async findById(id) {
        const queryText = `
            SELECT p.*,
                   m.identificador_interno as macho_identificador, m.anilla as macho_anilla,
                   h.identificador_interno as hembra_identificador, h.anilla as hembra_anilla
            FROM parejas p
            JOIN aves m ON p.macho_id = m.id
            JOIN aves h ON p.hembra_id = h.id
            WHERE p.id = $1
        `;
        const res = await db.query(queryText, [id]);
        return res.rows[0];
    }

    async findAll(filters = {}) {
        let queryText = `
            SELECT p.*,
                   m.identificador_interno as macho_identificador, m.anilla as macho_anilla,
                   h.identificador_interno as hembra_identificador, h.anilla as hembra_anilla
            FROM parejas p
            JOIN aves m ON p.macho_id = m.id
            JOIN aves h ON p.hembra_id = h.id
            WHERE 1=1
        `;
        const params = [];
        let index = 1;

        if (filters.activo !== undefined) {
            queryText += ` AND p.activo = $${index++}`;
            params.push(filters.activo);
        }

        queryText += ` ORDER BY p.fecha_inicio DESC, p.id DESC`;
        
        const res = await db.query(queryText, params);
        return res.rows;
    }
}

module.exports = new ParejaRepository();
