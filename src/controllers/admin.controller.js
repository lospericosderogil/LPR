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
                    COUNT(CASE WHEN estado_biologico = 'EN_VENTA' THEN 1 END) as en_venta,
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
            
            const resM = await db.query("SELECT id, anilla FROM aves WHERE sexo = 'M' AND estado_biologico = 'DISPONIBLE'");
            const resF = await db.query("SELECT id, anilla FROM aves WHERE sexo = 'F' AND estado_biologico = 'DISPONIBLE'");
            
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
                anilla, sexo, especie_id, 
                fecha_nacimiento, fecha_anillado, padre_id, madre_id, 
                procedencia, criador_origen, costo_compra, fecha_compra,
                estado_biologico,
                precio_venta, fecha_venta,
                fecha_fallecimiento, motivo_fallecimiento,
                fecha_cambio, motivo_cambio, cambiado_con,
                fecha_perdida, detalles_perdida,
                fecha_donacion, donado_a,
                comentario_otro,
                genotipo, fenotipo,
                foto_predeterminada,
                apunte_titulo, apunte_contenido,
                concurso_nombre, concurso_fecha, concurso_puntuacion, concurso_premio, concurso_comentario
            } = req.body;

            const mutacionesBody = req.body.mutaciones || [];
            const mutacionesTipos = req.body.mutaciones_tipo || {};
            const mutacionesList = Array.isArray(mutacionesBody) ? mutacionesBody.map(mid => ({
                mutacion_id: parseInt(mid),
                tipo: mutacionesTipos[mid] || 'FENOTIPO'
            })) : [];

            // Fotos subidas
            const urlsImagenes = [];
            if (req.files && req.files.length > 0) {
                const principalIdx = parseInt(foto_predeterminada) || 0;
                for (let i = 0; i < req.files.length; i++) {
                    const file = req.files[i];
                    const url = await storageConfig.uploadToSupabase(file);
                    urlsImagenes.push({
                        url,
                        es_principal: (i === principalIdx)
                    });
                    fs.unlinkSync(file.path);
                }
            }

            // Construir estado_detalles según el estado seleccionado
            const estadoDetalles = {};
            if (estado_biologico === 'VENDIDO') {
                if (fecha_venta) estadoDetalles.fecha_venta = fecha_venta;
            } else if (estado_biologico === 'INTERCAMBIADO') {
                if (fecha_cambio) estadoDetalles.fecha_cambio = fecha_cambio;
                if (motivo_cambio) estadoDetalles.motivo_cambio = motivo_cambio;
                if (cambiado_con) estadoDetalles.cambiado_con = cambiado_con;
            } else if (estado_biologico === 'PERDIDO') {
                if (fecha_perdida) estadoDetalles.fecha_perdida = fecha_perdida;
                if (detalles_perdida) estadoDetalles.detalles_perdida = detalles_perdida;
            } else if (estado_biologico === 'DONADO') {
                if (fecha_donacion) estadoDetalles.fecha_donacion = fecha_donacion;
                if (donado_a) estadoDetalles.donado_a = donado_a;
            } else if (estado_biologico === 'OTRO') {
                if (comentario_otro) estadoDetalles.comentario = comentario_otro;
            }

            // Construir procedencia_detalles
            let procedenciaDetalles = null;
            if (procedencia === 'COMPRA') {
                procedenciaDetalles = {
                    criador: criador_origen || null,
                    costo: costo_compra ? parseFloat(costo_compra) : null,
                    fecha_compra: fecha_compra || null
                };
            } else if (procedencia === 'OTRO') {
                procedenciaDetalles = {
                    criador: criador_origen || null
                };
            }

            const finalAnilla = anilla ? anilla.trim() : null;
            const publicadoWeb = req.body.publicado_web === '1' || req.body.publicado_web === 'on' || req.body.publicado_web === 'true' || req.body.publicado_web === true;
            const estado_biologico_val = estado_biologico || 'DISPONIBLE';
            const estado_publicacion = publicadoWeb ? 'EXHIBICION' : 'NO_PUBLICADA';
            const estado_comercial = estado_biologico_val === 'EN_VENTA' ? 'EN_VENTA' : 'NO_VENTA';

            const aveData = {
                anilla: finalAnilla,
                sexo,
                especie_id: parseInt(especie_id),
                fecha_nacimiento,
                fecha_anillado: fecha_anillado || null,
                padre_id: padre_id ? parseInt(padre_id) : null,
                madre_id: madre_id ? parseInt(madre_id) : null,
                procedencia,
                procedencia_detalles: procedenciaDetalles,
                estado_biologico: estado_biologico_val,
                estado_publicacion,
                estado_comercial,
                precio_venta: (estado_biologico_val === 'EN_VENTA' || estado_biologico_val === 'VENDIDO') && precio_venta ? parseFloat(precio_venta) : null,
                observaciones_comerciales: null,
                fecha_fallecimiento: estado_biologico_val === 'MUERTO' && fecha_fallecimiento ? fecha_fallecimiento : null,
                motivo_fallecimiento: estado_biologico_val === 'MUERTO' && motivo_fallecimiento ? motivo_fallecimiento : null,
                genotipo: genotipo ? genotipo.trim() : null,
                fenotipo: fenotipo ? fenotipo.trim() : null,
                estado_detalles: Object.keys(estadoDetalles).length > 0 ? estadoDetalles : null,
                usuario_ejecutor_id: req.session.user.id
            };

            const apunteData = (apunte_titulo && apunte_contenido) ? {
                titulo: apunte_titulo.trim(),
                contenido: apunte_contenido.trim()
            } : null;

            const concursoData = (concurso_nombre && concurso_fecha) ? {
                nombre_concurso: concurso_nombre.trim(),
                fecha: concurso_fecha,
                puntuacion: concurso_puntuacion ? parseInt(concurso_puntuacion) : null,
                premio: concurso_premio ? concurso_premio.trim() : null,
                comentarios: concurso_comentario ? concurso_comentario.trim() : null
            } : null;

            const nuevaAve = await aveService.registrarAve(aveData, mutacionesList, urlsImagenes, apunteData, concursoData);
            
            const isJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.headers['x-requested-with'] === 'XMLHttpRequest';
            if (isJson) {
                return res.json({
                    success: true,
                    isEdit: false,
                    message: '¡El ave ha sido registrada exitosamente!',
                    aveId: nuevaAve.id,
                    anilla: nuevaAve.anilla || ('ID #' + nuevaAve.id),
                    redirectUrl: '/admin/aves'
                });
            }
            res.redirect('/admin/aves');
        } catch (err) {
            console.error('❌ Error registrando ave:', err.message);
            const isJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.headers['x-requested-with'] === 'XMLHttpRequest';
            if (isJson) {
                return res.status(400).json({
                    success: false,
                    message: err.message || 'Error al registrar el ave'
                });
            }
            try {
                const especies = await catalogoRepository.getEspecies();
                const mutaciones = await catalogoRepository.getMutaciones();
                const resM = await db.query("SELECT id, anilla FROM aves WHERE sexo = 'M' AND estado_biologico = 'DISPONIBLE'");
                const resF = await db.query("SELECT id, anilla FROM aves WHERE sexo = 'F' AND estado_biologico = 'DISPONIBLE'");
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
            
            const resM = await db.query("SELECT id, anilla FROM aves WHERE sexo = 'M' AND estado_biologico = 'DISPONIBLE' AND id <> $1", [id]);
            const resF = await db.query("SELECT id, anilla FROM aves WHERE sexo = 'F' AND estado_biologico = 'DISPONIBLE' AND id <> $1", [id]);
            
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
                anilla, sexo, especie_id, 
                fecha_nacimiento, fecha_anillado, padre_id, madre_id, 
                procedencia, criador_origen, costo_compra, fecha_compra,
                estado_biologico,
                precio_venta, fecha_venta,
                fecha_fallecimiento, motivo_fallecimiento,
                fecha_cambio, motivo_cambio, cambiado_con,
                fecha_perdida, detalles_perdida,
                fecha_donacion, donado_a,
                comentario_otro,
                genotipo, fenotipo,
                foto_predeterminada,
                apunte_titulo, apunte_contenido,
                concurso_nombre, concurso_fecha, concurso_puntuacion, concurso_premio, concurso_comentario,
                imagenes_conservar
            } = req.body;

            const mutacionesBody = req.body.mutaciones || [];
            const mutacionesTipos = req.body.mutaciones_tipo || {};
            const mutacionesList = Array.isArray(mutacionesBody) ? mutacionesBody.map(mid => ({
                mutacion_id: parseInt(mid),
                tipo: mutacionesTipos[mid] || 'FENOTIPO'
            })) : [];

            // Manejo de imágenes conservadas y nuevas
            let conservar = [];
            if (imagenes_conservar) {
                conservar = Array.isArray(imagenes_conservar) ? imagenes_conservar : [imagenes_conservar];
            }

            const imagenesExistentes = conservar.map(url => ({
                url,
                es_principal: (foto_predeterminada === url)
            }));

            const imagenesNuevas = [];
            if (req.files && req.files.length > 0) {
                for (let i = 0; i < req.files.length; i++) {
                    const file = req.files[i];
                    const url = await storageConfig.uploadToSupabase(file);
                    const isPrincipal = (foto_predeterminada === `nueva_${i}`) || (imagenesExistentes.length === 0 && i === 0 && !foto_predeterminada);
                    imagenesNuevas.push({
                        url,
                        es_principal: isPrincipal
                    });
                    fs.unlinkSync(file.path);
                }
            }

            const totalFotos = [...imagenesExistentes, ...imagenesNuevas];
            if (totalFotos.length > 0 && !totalFotos.some(f => f.es_principal)) {
                if (imagenesExistentes.length > 0) imagenesExistentes[0].es_principal = true;
                else if (imagenesNuevas.length > 0) imagenesNuevas[0].es_principal = true;
            }

            const estadoDetalles = {};
            if (estado_biologico === 'VENDIDO') {
                if (fecha_venta) estadoDetalles.fecha_venta = fecha_venta;
            } else if (estado_biologico === 'INTERCAMBIADO') {
                if (fecha_cambio) estadoDetalles.fecha_cambio = fecha_cambio;
                if (motivo_cambio) estadoDetalles.motivo_cambio = motivo_cambio;
                if (cambiado_con) estadoDetalles.cambiado_con = cambiado_con;
            } else if (estado_biologico === 'PERDIDO') {
                if (fecha_perdida) estadoDetalles.fecha_perdida = fecha_perdida;
                if (detalles_perdida) estadoDetalles.detalles_perdida = detalles_perdida;
            } else if (estado_biologico === 'DONADO') {
                if (fecha_donacion) estadoDetalles.fecha_donacion = fecha_donacion;
                if (donado_a) estadoDetalles.donado_a = donado_a;
            } else if (estado_biologico === 'OTRO') {
                if (comentario_otro) estadoDetalles.comentario = comentario_otro;
            }

            let procedenciaDetalles = null;
            if (procedencia === 'COMPRA') {
                procedenciaDetalles = {
                    criador: criador_origen || null,
                    costo: costo_compra ? parseFloat(costo_compra) : null,
                    fecha_compra: fecha_compra || null
                };
            } else if (procedencia === 'OTRO') {
                procedenciaDetalles = {
                    criador: criador_origen || null
                };
            }

            const finalAnilla = anilla ? anilla.trim() : null;
            const publicadoWeb = req.body.publicado_web === '1' || req.body.publicado_web === 'on' || req.body.publicado_web === 'true' || req.body.publicado_web === true;
            const estado_biologico_val = estado_biologico || 'DISPONIBLE';
            const estado_publicacion = publicadoWeb ? 'EXHIBICION' : 'NO_PUBLICADA';
            const estado_comercial = estado_biologico_val === 'EN_VENTA' ? 'EN_VENTA' : 'NO_VENTA';

            const aveData = {
                anilla: finalAnilla,
                sexo,
                especie_id: parseInt(especie_id),
                fecha_nacimiento,
                fecha_anillado: fecha_anillado || null,
                padre_id: padre_id ? parseInt(padre_id) : null,
                madre_id: madre_id ? parseInt(madre_id) : null,
                procedencia,
                procedencia_detalles: procedenciaDetalles,
                estado_biologico: estado_biologico_val,
                estado_publicacion,
                estado_comercial,
                precio_venta: (estado_biologico_val === 'EN_VENTA' || estado_biologico_val === 'VENDIDO') && precio_venta ? parseFloat(precio_venta) : null,
                observaciones_comerciales: null,
                fecha_fallecimiento: estado_biologico_val === 'MUERTO' && fecha_fallecimiento ? fecha_fallecimiento : null,
                motivo_fallecimiento: estado_biologico_val === 'MUERTO' && motivo_fallecimiento ? motivo_fallecimiento : null,
                genotipo: genotipo ? genotipo.trim() : null,
                fenotipo: fenotipo ? fenotipo.trim() : null,
                estado_detalles: Object.keys(estadoDetalles).length > 0 ? estadoDetalles : null,
                usuario_ejecutor_id: req.session.user.id
            };

            const apunteData = (apunte_titulo && apunte_contenido) ? {
                titulo: apunte_titulo.trim(),
                contenido: apunte_contenido.trim()
            } : null;

            const concursoData = (concurso_nombre && concurso_fecha) ? {
                nombre_concurso: concurso_nombre.trim(),
                fecha: concurso_fecha,
                puntuacion: concurso_puntuacion ? parseInt(concurso_puntuacion) : null,
                premio: concurso_premio ? concurso_premio.trim() : null,
                comentarios: concurso_comentario ? concurso_comentario.trim() : null
            } : null;

            const aveActualizada = await aveService.actualizarAve(id, aveData, mutacionesList, imagenesNuevas, imagenesExistentes, apunteData, concursoData);
            
            const isJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.headers['x-requested-with'] === 'XMLHttpRequest';
            if (isJson) {
                return res.json({
                    success: true,
                    isEdit: true,
                    message: '¡El ave ha sido actualizada exitosamente!',
                    aveId: id,
                    anilla: aveActualizada.anilla || ('ID #' + id),
                    redirectUrl: '/admin/aves'
                });
            }
            res.redirect('/admin/aves');
        } catch (err) {
            console.error('❌ Error actualizando ave:', err.message);
            const isJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.headers['x-requested-with'] === 'XMLHttpRequest';
            if (isJson) {
                return res.status(400).json({
                    success: false,
                    message: err.message || 'Error al actualizar el ave'
                });
            }
            try {
                const { id } = req.params;
                const ave = await aveService.obtenerAveConDetalles(id);
                const especies = await catalogoRepository.getEspecies();
                const mutaciones = await catalogoRepository.getMutaciones();
                const resM = await db.query("SELECT id, anilla FROM aves WHERE sexo = 'M' AND estado_biologico = 'DISPONIBLE' AND id <> $1", [id]);
                const resF = await db.query("SELECT id, anilla FROM aves WHERE sexo = 'F' AND estado_biologico = 'DISPONIBLE' AND id <> $1", [id]);
                
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
                SELECT id, anilla FROM aves 
                WHERE sexo = 'M' AND estado_biologico = 'DISPONIBLE'
                  AND id NOT IN (
                      SELECT macho_id FROM parejas WHERE activo = true AND fecha_fin IS NULL
                  )
            `);
            const resF = await db.query(`
                SELECT id, anilla FROM aves 
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
                const resM = await db.query("SELECT id, anilla FROM aves WHERE sexo = 'M' AND estado_biologico = 'DISPONIBLE' AND id NOT IN (SELECT macho_id FROM parejas WHERE activo = true AND fecha_fin IS NULL)");
                const resF = await db.query("SELECT id, anilla FROM aves WHERE sexo = 'F' AND estado_biologico = 'DISPONIBLE' AND id NOT IN (SELECT hembra_id FROM parejas WHERE activo = true AND fecha_fin IS NULL)");
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
