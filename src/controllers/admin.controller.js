const db = require('../config/db');
const aveService = require('../services/ave.service');
const aveRepository = require('../repositories/ave.repository');
const catalogoRepository = require('../repositories/catalogo.repository');
const parejaService = require('../services/pareja.service');
const storageConfig = require('../config/storage');
const fs = require('fs');

class AdminController {
    async dashboard(req, res, next) {
        try {
            const resCounts = await db.query(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN sexo = 'M' THEN 1 END) as machos,
                    COUNT(CASE WHEN sexo = 'F' THEN 1 END) as hembras,
                    COUNT(CASE WHEN estado_biologico = 'DISPONIBLE' THEN 1 END) as disponibles,
                    COUNT(CASE WHEN estado_comercial = 'EN_VENTA' THEN 1 END) as en_venta,
                    COUNT(CASE WHEN estado_biologico = 'VENDIDO' THEN 1 END) as vendidos
                FROM aves
            `);
            
            const stats = resCounts.rows[0];
            res.render('admin/dashboard', { title: 'Dashboard - Admin', stats });
        } catch (err) {
            next(err);
        }
    }

    async listarAves(req, res, next) {
        try {
            const filters = {
                sexo: req.query.sexo || null,
                especie_id: req.query.especie_id || null,
                estado_biologico: req.query.estado_biologico || null,
                estado_comercial: req.query.estado_comercial || null,
                search: req.query.search || null
            };

            const aves = await aveService.listarAves(filters);
            const especies = await catalogoRepository.getEspecies();
            
            res.render('admin/aves', { title: 'Gestión de Aves', aves, especies, filters });
        } catch (err) {
            next(err);
        }
    }

    async formNuevaAve(req, res, next) {
        try {
            const especies = await catalogoRepository.getEspecies();
            const mutaciones = await catalogoRepository.getMutaciones();
            
            const resM = await db.query("SELECT id, identificador_interno, anilla FROM aves WHERE sexo = 'M' AND estado_biologico = 'DISPONIBLE'");
            const resF = await db.query("SELECT id, identificador_interno, anilla FROM aves WHERE sexo = 'F' AND estado_biologico = 'DISPONIBLE'");
            
            res.render('admin/form_ave', { 
                title: 'Registrar Nueva Ave', 
                ave: null, 
                especies, 
                mutaciones, 
                machos: resM.rows, 
                hembras: resF.rows,
                error: null 
            });
        } catch (err) {
            next(err);
        }
    }

    async registrarAve(req, res, next) {
        try {
            const { 
                anilla, identificador_interno, sexo, especie_id, 
                fecha_nacimiento, fecha_anillado, padre_id, madre_id, 
                procedencia, criador_origen, costo_compra, fecha_compra,
                estado_biologico, estado_publicacion, estado_comercial, precio_venta, 
                observaciones_comerciales 
            } = req.body;

            const mutacionesBody = req.body.mutaciones || [];
            const mutacionesTipos = req.body.mutaciones_tipo || {};
            const mutacionesList = Array.isArray(mutacionesBody) ? mutacionesBody.map(mid => ({
                mutacion_id: parseInt(mid),
                tipo: mutacionesTipos[mid] || 'FENOTIPO'
            })) : [];

            const urlsImagenes = [];
            if (req.files && req.files.length > 0) {
                for (const file of req.files) {
                    const url = await storageConfig.uploadToSupabase(file);
                    urlsImagenes.push(url);
                    fs.unlinkSync(file.path);
                }
            }

            const aveData = {
                anilla,
                identificador_interno,
                sexo,
                especie_id: parseInt(especie_id),
                fecha_nacimiento,
                fecha_anillado: fecha_anillado || null,
                padre_id: padre_id ? parseInt(padre_id) : null,
                madre_id: madre_id ? parseInt(madre_id) : null,
                procedencia,
                procedencia_detalles: procedencia === 'COMPRA' ? {
                    criador: criador_origen,
                    costo: costo_compra ? parseFloat(costo_compra) : null,
                    fecha_compra: fecha_compra || null
                } : null,
                estado_biologico,
                estado_publicacion,
                estado_comercial,
                precio_venta: precio_venta ? parseFloat(precio_venta) : null,
                observaciones_comerciales,
                usuario_ejecutor_id: req.session.user.id
            };

            await aveService.registrarAve(aveData, mutacionesList, urlsImagenes);
            res.redirect('/admin/aves');
        } catch (err) {
            console.error('❌ Error registrando ave:', err.message);
            try {
                const especies = await catalogoRepository.getEspecies();
                const mutaciones = await catalogoRepository.getMutaciones();
                const resM = await db.query("SELECT id, identificador_interno, anilla FROM aves WHERE sexo = 'M' AND estado_biologico = 'DISPONIBLE'");
                const resF = await db.query("SELECT id, identificador_interno, anilla FROM aves WHERE sexo = 'F' AND estado_biologico = 'DISPONIBLE'");
                res.render('admin/form_ave', { 
                    title: 'Registrar Nueva Ave', 
                    ave: null, 
                    especies, 
                    mutaciones, 
                    machos: resM.rows, 
                    hembras: resF.rows,
                    error: err.message 
                });
            } catch (err2) {
                next(err2);
            }
        }
    }

    async formEditarAve(req, res, next) {
        try {
            const { id } = req.params;
            const ave = await aveService.obtenerAveConDetalles(id);
            if (!ave) {
                return res.status(404).render('error', { title: 'No Encontrada', message: 'El ave no existe', statusCode: 404 });
            }

            const especies = await catalogoRepository.getEspecies();
            const mutaciones = await catalogoRepository.getMutaciones();
            
            const resM = await db.query("SELECT id, identificador_interno, anilla FROM aves WHERE sexo = 'M' AND estado_biologico = 'DISPONIBLE' AND id <> $1", [id]);
            const resF = await db.query("SELECT id, identificador_interno, anilla FROM aves WHERE sexo = 'F' AND estado_biologico = 'DISPONIBLE' AND id <> $1", [id]);
            
            res.render('admin/form_ave', { 
                title: 'Editar Ave', 
                ave, 
                especies, 
                mutaciones, 
                machos: resM.rows, 
                hembras: resF.rows,
                error: null 
            });
        } catch (err) {
            next(err);
        }
    }

    async actualizarAve(req, res, next) {
        try {
            const { id } = req.params;
            const { 
                anilla, identificador_interno, sexo, especie_id, 
                fecha_nacimiento, fecha_anillado, padre_id, madre_id, 
                procedencia, criador_origen, costo_compra, fecha_compra,
                estado_biologico, estado_publicacion, estado_comercial, precio_venta, 
                observaciones_comerciales, fecha_fallecimiento, motivo_fallecimiento
            } = req.body;

            const mutacionesBody = req.body.mutaciones || [];
            const mutacionesTipos = req.body.mutaciones_tipo || {};
            const mutacionesList = Array.isArray(mutacionesBody) ? mutacionesBody.map(mid => ({
                mutacion_id: parseInt(mid),
                tipo: mutacionesTipos[mid] || 'FENOTIPO'
            })) : [];

            const urlsImagenes = [];
            if (req.files && req.files.length > 0) {
                for (const file of req.files) {
                    const url = await storageConfig.uploadToSupabase(file);
                    urlsImagenes.push(url);
                    fs.unlinkSync(file.path);
                }
            }

            const aveData = {
                anilla,
                identificador_interno,
                sexo,
                especie_id: parseInt(especie_id),
                fecha_nacimiento,
                fecha_anillado: fecha_anillado || null,
                padre_id: padre_id ? parseInt(padre_id) : null,
                madre_id: madre_id ? parseInt(madre_id) : null,
                procedencia,
                procedencia_detalles: procedencia === 'COMPRA' ? {
                    criador: criador_origen,
                    costo: costo_compra ? parseFloat(costo_compra) : null,
                    fecha_compra: fecha_compra || null
                } : null,
                estado_biologico,
                estado_publicacion,
                estado_comercial,
                precio_venta: precio_venta ? parseFloat(precio_venta) : null,
                observaciones_comerciales,
                fecha_fallecimiento: fecha_fallecimiento || null,
                motivo_fallecimiento: motivo_fallecimiento || null,
                usuario_ejecutor_id: req.session.user.id
            };

            await aveService.actualizarAve(id, aveData, mutacionesList, urlsImagenes);
            res.redirect('/admin/aves');
        } catch (err) {
            console.error('❌ Error actualizando ave:', err.message);
            try {
                const { id } = req.params;
                const ave = await aveService.obtenerAveConDetalles(id);
                const especies = await catalogoRepository.getEspecies();
                const mutaciones = await catalogoRepository.getMutaciones();
                const resM = await db.query("SELECT id, identificador_interno, anilla FROM aves WHERE sexo = 'M' AND estado_biologico = 'DISPONIBLE' AND id <> $1", [id]);
                const resF = await db.query("SELECT id, identificador_interno, anilla FROM aves WHERE sexo = 'F' AND estado_biologico = 'DISPONIBLE' AND id <> $1", [id]);
                
                res.render('admin/form_ave', { 
                    title: 'Editar Ave', 
                    ave, 
                    especies, 
                    mutaciones, 
                    machos: resM.rows, 
                    hembras: resF.rows,
                    error: err.message 
                });
            } catch (err2) {
                next(err2);
            }
        }
    }

    // --- MÓDULO PAREJAS ---
    async listarParejas(req, res, next) {
        try {
            const filters = {};
            if (req.query.activo === 'true') filters.activo = true;
            if (req.query.activo === 'false') filters.activo = false;

            const parejas = await parejaService.listarParejas(filters);
            res.render('admin/parejas', { title: 'Gestión de Parejas', parejas, query: req.query });
        } catch (err) {
            next(err);
        }
    }

    async formNuevaPareja(req, res, next) {
        try {
            // Cargar machos y hembras sin parejas activas actualmente
            const resM = await db.query(`
                SELECT id, identificador_interno, anilla FROM aves 
                WHERE sexo = 'M' AND estado_biologico = 'DISPONIBLE'
                  AND id NOT IN (
                      SELECT macho_id FROM parejas WHERE activo = true AND fecha_fin IS NULL
                  )
            `);
            const resF = await db.query(`
                SELECT id, identificador_interno, anilla FROM aves 
                WHERE sexo = 'F' AND estado_biologico = 'DISPONIBLE'
                  AND id NOT IN (
                      SELECT hembra_id FROM parejas WHERE activo = true AND fecha_fin IS NULL
                  )
            `);

            res.render('admin/form_pareja', { 
                title: 'Crear Pareja Reproductiva', 
                machos: resM.rows, 
                hembras: resF.rows, 
                error: null 
            });
        } catch (err) {
            next(err);
        }
    }

    async registrarPareja(req, res, next) {
        try {
            const { macho_id, hembra_id, fecha_inicio, jaula, nido, comentario } = req.body;
            
            await parejaService.registrarPareja({
                macho_id: parseInt(macho_id),
                hembra_id: parseInt(hembra_id),
                fecha_inicio,
                jaula,
                nido,
                comentario,
                usuario_ejecutor_id: req.session.user.id
            });

            res.redirect('/admin/parejas');
        } catch (err) {
            console.error('❌ Error creando pareja:', err.message);
            try {
                const resM = await db.query("SELECT id, identificador_interno, anilla FROM aves WHERE sexo = 'M' AND estado_biologico = 'DISPONIBLE' AND id NOT IN (SELECT macho_id FROM parejas WHERE activo = true AND fecha_fin IS NULL)");
                const resF = await db.query("SELECT id, identificador_interno, anilla FROM aves WHERE sexo = 'F' AND estado_biologico = 'DISPONIBLE' AND id NOT IN (SELECT hembra_id FROM parejas WHERE activo = true AND fecha_fin IS NULL)");
                res.render('admin/form_pareja', { 
                    title: 'Crear Pareja Reproductiva', 
                    machos: resM.rows, 
                    hembras: resF.rows, 
                    error: err.message 
                });
            } catch (err2) {
                next(err2);
            }
        }
    }

    async desunirPareja(req, res, next) {
        try {
            const { id } = req.params;
            const { fecha_fin, comentario_fin } = req.body;

            await parejaService.desunirPareja(
                parseInt(id),
                fecha_fin || null,
                comentario_fin || null,
                req.session.user.id
            );

            res.redirect('/admin/parejas');
        } catch (err) {
            next(err);
        }
    }

    // --- MÓDULO GENEALOGÍA ---
    async verGenealogia(req, res, next) {
        try {
            const { id } = req.params;
            const ave = await aveService.obtenerAveConDetalles(id);
            if (!ave) {
                return res.status(404).render('error', { title: 'No Encontrada', message: 'El ave no existe', statusCode: 404 });
            }

            const ancestors = await aveRepository.getAncestors(id);
            
            // Construir árbol en estructura jerárquica
            const map = {};
            ancestors.forEach(a => {
                map[a.id] = { ...a, padre: null, madre: null };
            });

            ancestors.forEach(a => {
                const node = map[a.id];
                if (node.padre_id && map[node.padre_id]) {
                    node.padre = map[node.padre_id];
                }
                if (node.madre_id && map[node.madre_id]) {
                    node.madre = map[node.madre_id];
                }
            });

            const arbol = map[id] || null;

            res.render('admin/genealogia', { title: 'Árbol Genealógico', ave, arbol });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AdminController();
