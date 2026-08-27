const db = require('../config/db');

class AveRepository {
    async create(ave, client = db) {
        const queryText = `
            INSERT INTO aves (
                anilla, identificador_interno, sexo, especie_id, 
                fecha_nacimiento, fecha_anillado, padre_id, madre_id, 
                procedencia, procedencia_detalles, estado_biologico, 
                estado_publicacion, estado_comercial, precio_venta, 
                observaciones_comerciales, fecha_fallecimiento, motivo_fallecimiento
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
            ) RETURNING *
        `;
        const params = [
            ave.anilla || null,
            ave.identificador_interno,
            ave.sexo,
            ave.especie_id,
            ave.fecha_nacimiento,
            ave.fecha_anillado || null,
            ave.padre_id || null,
            ave.madre_id || null,
            ave.procedencia,
            ave.procedencia_detalles ? JSON.stringify(ave.procedencia_detalles) : null,
            ave.estado_biologico || 'DISPONIBLE',
            ave.estado_publicacion || 'NO_PUBLICADA',
            ave.estado_comercial || 'NO_VENTA',
            ave.precio_venta || null,
            ave.observaciones_comerciales || null,
            ave.fecha_fallecimiento || null,
            ave.motivo_fallecimiento || null
        ];
        const res = await client.query(queryText, params);
        return res.rows[0];
    }

    async update(id, ave, client = db) {
        const queryText = `
            UPDATE aves SET
                anilla = $1,
                identificador_interno = $2,
                sexo = $3,
                especie_id = $4,
                fecha_nacimiento = $5,
                fecha_anillado = $6,
                padre_id = $7,
                madre_id = $8,
                procedencia = $9,
                procedencia_detalles = $10,
                estado_biologico = $11,
                estado_publicacion = $12,
                estado_comercial = $13,
                precio_venta = $14,
                observaciones_comerciales = $15,
                fecha_fallecimiento = $16,
                motivo_fallecimiento = $17
            WHERE id = $18
            RETURNING *
        `;
        const params = [
            ave.anilla || null,
            ave.identificador_interno,
            ave.sexo,
            ave.especie_id,
            ave.fecha_nacimiento,
            ave.fecha_anillado || null,
            ave.padre_id || null,
            ave.madre_id || null,
            ave.procedencia,
            ave.procedencia_detalles ? JSON.stringify(ave.procedencia_detalles) : null,
            ave.estado_biologico,
            ave.estado_publicacion,
            ave.estado_comercial,
            ave.precio_venta || null,
            ave.observaciones_comerciales || null,
            ave.fecha_fallecimiento || null,
            ave.motivo_fallecimiento || null,
            id
        ];
        const res = await client.query(queryText, params);
        return res.rows[0];
    }

    async findById(id) {
        const queryText = `
            SELECT a.*, e.nombre as especie_nombre,
                   p.identificador_interno as padre_identificador, p.anilla as padre_anilla,
                   m.identificador_interno as madre_identificador, m.anilla as madre_anilla
            FROM aves a
            LEFT JOIN especies e ON a.especie_id = e.id
            LEFT JOIN aves p ON a.padre_id = p.id
            LEFT JOIN aves m ON a.madre_id = m.id
            WHERE a.id = $1
        `;
        const res = await db.query(queryText, [id]);
        return res.rows[0];
    }

    async findAll(filters = {}) {
        let queryText = `
            SELECT a.*, e.nombre as especie_nombre 
            FROM aves a
            LEFT JOIN especies e ON a.especie_id = e.id
            WHERE 1=1
        `;
        const params = [];
        let index = 1;

        if (filters.sexo) {
            queryText += ` AND a.sexo = $${index++}`;
            params.push(filters.sexo);
        }
        if (filters.especie_id) {
            queryText += ` AND a.especie_id = $${index++}`;
            params.push(filters.especie_id);
        }
        if (filters.estado_biologico) {
            queryText += ` AND a.estado_biologico = $${index++}`;
            params.push(filters.estado_biologico);
        }
        if (filters.estado_comercial) {
            queryText += ` AND a.estado_comercial = $${index++}`;
            params.push(filters.estado_comercial);
        }
        if (filters.estado_publicacion) {
            queryText += ` AND a.estado_publicacion = $${index++}`;
            params.push(filters.estado_publicacion);
        }
        if (filters.search) {
            queryText += ` AND (a.anilla ILIKE $${index} OR a.identificador_interno ILIKE $${index++})`;
            params.push(`%${filters.search}%`);
        }

        queryText += ` ORDER BY a.created_at DESC`;

        const res = await db.query(queryText, params);
        return res.rows;
    }

    async addMutation(aveId, mutacionId, tipo, client = db) {
        const queryText = `
            INSERT INTO ave_mutaciones (ave_id, mutacion_id, tipo) 
            VALUES ($1, $2, $3)
            ON CONFLICT DO NOTHING
        `;
        await client.query(queryText, [aveId, mutacionId, tipo]);
    }

    async clearMutations(aveId, client = db) {
        const queryText = `DELETE FROM ave_mutaciones WHERE ave_id = $1`;
        await client.query(queryText, [aveId]);
    }

    async getMutations(aveId) {
        const queryText = `
            SELECT am.tipo, m.id, m.nombre 
            FROM ave_mutaciones am
            JOIN mutaciones m ON am.mutacion_id = m.id
            WHERE am.ave_id = $1
        `;
        const res = await db.query(queryText, [aveId]);
        return res.rows;
    }

    async getAncestors(aveId) {
        const queryText = `
            WITH RECURSIVE ancestral_tree AS (
                SELECT id, identificador_interno, anilla, sexo, padre_id, madre_id, 1 as nivel
                FROM aves
                WHERE id = $1
                UNION ALL
                SELECT a.id, a.identificador_interno, a.anilla, a.sexo, a.padre_id, a.madre_id, t.nivel + 1
                FROM aves a
                INNER JOIN ancestral_tree t ON a.id = t.padre_id OR a.id = t.madre_id
                WHERE t.nivel < 4
            )
            SELECT DISTINCT id, identificador_interno, anilla, sexo, padre_id, madre_id, nivel FROM ancestral_tree;
        `;
        const res = await db.query(queryText, [aveId]);
        return res.rows;
    }
}

module.exports = new AveRepository();
