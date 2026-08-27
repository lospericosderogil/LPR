const db = require('../config/db');
const aveRepository = require('../repositories/ave.repository');

class AveService {
    async registrarAve(aveData, mutaciones = [], imagenes = []) {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            
            if (aveData.usuario_ejecutor_id) {
                await client.query(`SET LOCAL app.current_user_id = ${aveData.usuario_ejecutor_id}`);
            }

            const nuevaAve = await aveRepository.create(aveData, client);

            // Asignar mutaciones
            for (const item of mutaciones) {
                await aveRepository.addMutation(nuevaAve.id, item.mutacion_id, item.tipo, client);
            }

            // Asignar imágenes
            if (imagenes && imagenes.length > 0) {
                for (let i = 0; i < imagenes.length; i++) {
                    const isPrincipal = i === 0;
                    await client.query(
                        'INSERT INTO imagenes_ave (ave_id, url, es_principal) VALUES ($1, $2, $3)',
                        [nuevaAve.id, imagenes[i], isPrincipal]
                    );
                }
            }

            await client.query('COMMIT');
            return await this.obtenerAveConDetalles(nuevaAve.id);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    async actualizarAve(id, aveData, mutaciones = [], imagenes = []) {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            
            if (aveData.usuario_ejecutor_id) {
                await client.query(`SET LOCAL app.current_user_id = ${aveData.usuario_ejecutor_id}`);
            }

            const aveActualizada = await aveRepository.update(id, aveData, client);

            // Actualizar mutaciones
            await aveRepository.clearMutations(id, client);
            for (const item of mutaciones) {
                await aveRepository.addMutation(id, item.mutacion_id, item.tipo, client);
            }

            // Si se subieron nuevas imágenes, limpiar anteriores y guardar nuevas
            if (imagenes && imagenes.length > 0) {
                await client.query('DELETE FROM imagenes_ave WHERE ave_id = $1', [id]);
                for (let i = 0; i < imagenes.length; i++) {
                    const isPrincipal = i === 0;
                    await client.query(
                        'INSERT INTO imagenes_ave (ave_id, url, es_principal) VALUES ($1, $2, $3)',
                        [id, imagenes[i], isPrincipal]
                    );
                }
            }

            await client.query('COMMIT');
            return await this.obtenerAveConDetalles(id);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    async obtenerAveConDetalles(id) {
        const ave = await aveRepository.findById(id);
        if (!ave) return null;
        
        ave.mutaciones = await aveRepository.getMutations(id);
        // Cargar imágenes
        const resImg = await db.query('SELECT * FROM imagenes_ave WHERE ave_id = $1 ORDER BY es_principal DESC', [id]);
        ave.imagenes = resImg.rows;
        
        return ave;
    }

    async listarAves(filters = {}) {
        const list = await aveRepository.findAll(filters);
        for (const ave of list) {
            ave.mutaciones = await aveRepository.getMutations(ave.id);
            const resImg = await db.query('SELECT * FROM imagenes_ave WHERE ave_id = $1 ORDER BY es_principal DESC', [ave.id]);
            ave.imagenes = resImg.rows;
        }
        return list;
    }
}

module.exports = new AveService();
