const db = require('../config/db');
const aveRepository = require('../repositories/ave.repository');

class AveService {
    async registrarAve(aveData, mutaciones = [], imagenes = [], apunte = null, concurso = null) {
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
                for (const img of imagenes) {
                    const url = typeof img === 'string' ? img : img.url;
                    const isPrincipal = typeof img === 'object' && 'es_principal' in img ? img.es_principal : false;
                    await client.query(
                        'INSERT INTO imagenes_ave (ave_id, url, es_principal) VALUES ($1, $2, $3)',
                        [nuevaAve.id, url, isPrincipal]
                    );
                }
            }

            // Asignar apunte inicial si fue completado
            if (apunte && apunte.titulo && apunte.contenido) {
                await aveRepository.addApunte(nuevaAve.id, apunte.titulo, apunte.contenido, client);
            }

            // Asignar concurso inicial si fue completado
            if (concurso && concurso.nombre_concurso && concurso.fecha) {
                await aveRepository.addConcurso(nuevaAve.id, concurso, client);
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

    async actualizarAve(id, aveData, mutaciones = [], imagenesNuevas = [], imagenesExistentes = [], apunte = null, concurso = null) {
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

            // Gestión de imágenes si hay cambios (existentes preservadas o nuevas añadidas)
            if (imagenesExistentes.length > 0 || imagenesNuevas.length > 0) {
                await client.query('DELETE FROM imagenes_ave WHERE ave_id = $1', [id]);
                for (const img of imagenesExistentes) {
                    await client.query(
                        'INSERT INTO imagenes_ave (ave_id, url, es_principal) VALUES ($1, $2, $3)',
                        [id, img.url, img.es_principal || false]
                    );
                }
                for (const img of imagenesNuevas) {
                    const url = typeof img === 'string' ? img : img.url;
                    const isPrincipal = typeof img === 'object' && 'es_principal' in img ? img.es_principal : false;
                    await client.query(
                        'INSERT INTO imagenes_ave (ave_id, url, es_principal) VALUES ($1, $2, $3)',
                        [id, url, isPrincipal]
                    );
                }
            }

            // Guardar apunte nuevo si se ingresó
            if (apunte && apunte.titulo && apunte.contenido) {
                await aveRepository.addApunte(id, apunte.titulo, apunte.contenido, client);
            }

            // Guardar concurso nuevo si se ingresó
            if (concurso && concurso.nombre_concurso && concurso.fecha) {
                await aveRepository.addConcurso(id, concurso, client);
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
        const resImg = await db.query('SELECT * FROM imagenes_ave WHERE ave_id = $1 ORDER BY es_principal DESC, id ASC', [id]);
        ave.imagenes = resImg.rows;

        // Cargar apuntes
        ave.apuntes = await aveRepository.getApuntes(id);

        // Cargar concursos
        ave.concursos = await aveRepository.getConcursos(id);
        
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
