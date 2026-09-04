const db = require('../config/db');

class CatalogoRepository {
    async getEspecies() {
        const res = await db.query('SELECT * FROM especies WHERE activo = true ORDER BY nombre ASC');
        return res.rows;
    }

    async getMutaciones() {
        const res = await db.query(`
            SELECT * FROM mutaciones 
            WHERE activo = true 
            ORDER BY 
                CASE categoria
                    WHEN 'Color Base' THEN 1
                    WHEN 'Factor Tono' THEN 2
                    WHEN 'Factor Color' THEN 3
                    WHEN 'Máscara' THEN 4
                    WHEN 'Plumaje' THEN 5
                    WHEN 'Hipermelánica' THEN 6
                    WHEN 'Patrón Alar' THEN 7
                    WHEN 'Ligada al Sexo' THEN 8
                    WHEN 'Compuesta' THEN 9
                    ELSE 10
                END,
                id ASC
        `);
        return res.rows;
    }

    async createEspecie(nombre) {
        const res = await db.query('INSERT INTO especies (nombre) VALUES ($1) RETURNING *', [nombre]);
        return res.rows[0];
    }

    async createMutacion(nombre, descripcion) {
        const res = await db.query('INSERT INTO mutaciones (nombre, descripcion) VALUES ($1, $2) RETURNING *', [nombre, descripcion]);
        return res.rows[0];
    }
}

module.exports = new CatalogoRepository();
