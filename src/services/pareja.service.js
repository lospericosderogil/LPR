const db = require('../config/db');
const parejaRepository = require('../repositories/pareja.repository');

class ParejaService {
    async registrarPareja(parejaData) {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            if (parejaData.usuario_ejecutor_id) {
                await client.query(`SET LOCAL app.current_user_id = ${parejaData.usuario_ejecutor_id}`);
            }

            const nuevaPareja = await parejaRepository.create(parejaData, client);

            await client.query('COMMIT');
            return nuevaPareja;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    async desunirPareja(id, fechaFin, comentarioFin, usuarioEjecutorId) {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            if (usuarioEjecutorId) {
                await client.query(`SET LOCAL app.current_user_id = ${usuarioEjecutorId}`);
            }

            const pareja = await parejaRepository.findById(id);
            if (!pareja) {
                throw new Error('La pareja no existe.');
            }

            pareja.fecha_fin = fechaFin || new Date();
            pareja.activo = false;
            if (comentarioFin) {
                pareja.comentario = pareja.comentario 
                    ? `${pareja.comentario} | Separación: ${comentarioFin}`
                    : `Separación: ${comentarioFin}`;
            }

            const updated = await parejaRepository.update(id, pareja, client);

            await client.query('COMMIT');
            return updated;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    async obtenerPareja(id) {
        return await parejaRepository.findById(id);
    }

    async listarParejas(filters = {}) {
        return await parejaRepository.findAll(filters);
    }
}

module.exports = new ParejaService();
