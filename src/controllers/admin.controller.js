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
            
            // Estadísticas Comerciales & Inventario
            const resVentas = await db.query(`
                SELECT 
                    COUNT(*) as total_pedidos,
                    COALESCE(SUM(total), 0) as ingresos_totales,
                    COUNT(CASE WHEN estado IN ('PENDIENTE', 'CONFIRMADO', 'EN_PREPARACION') THEN 1 END) as pedidos_pendientes
                FROM pedidos
            `);

            const resCategorias = await db.query(`SELECT COUNT(*) as total_categorias FROM categorias_catalogo WHERE activo = true`);
            const resProductos = await db.query(`SELECT COUNT(*) as total_productos FROM productos_tienda WHERE activo = true`);
            const ultimosPedidos = await db.query(`SELECT * FROM pedidos ORDER BY created_at DESC LIMIT 5`);

            const stats = {
                ...resCounts.rows[0],
                ...resVentas.rows[0],
                total_categorias: resCategorias.rows[0]?.total_categorias || 0,
                total_productos: resProductos.rows[0]?.total_productos || 0,
                ultimos_pedidos: ultimosPedidos.rows || []
            };

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

    // --- MÓDULO CATEGORÍAS COMERCIALES ---
    async listarCategorias(req, res, next) {
        try {
            const queryText = `
                SELECT c.*, 
                       (SELECT COUNT(*) FROM productos_tienda WHERE categoria_id = c.id) as total_productos
                FROM categorias_catalogo c
                ORDER BY c.orden ASC, c.id ASC
            `;
            const result = await db.query(queryText);
            res.render('admin/categorias', {
                title: 'Gestión de Categorías - Admin',
                categorias: result.rows,
                query: req.query
            });
        } catch (err) {
            next(err);
        }
    }

    async guardarCategoria(req, res, next) {
        try {
            const { id, slug, nombre, icono, imagen, descripcion, orden, activo } = req.body;
            const esActivo = activo === 'on' || activo === 'true' || activo === true;
            const ordenNum = parseInt(orden) || 0;

            if (id) {
                // Actualizar
                await db.query(`
                    UPDATE categorias_catalogo
                    SET slug = $1, nombre = $2, icono = $3, imagen = $4, descripcion = $5, orden = $6, activo = $7
                    WHERE id = $8
                `, [slug.trim().toLowerCase(), nombre.trim(), icono || '📦', imagen || '', descripcion || '', ordenNum, esActivo, id]);
            } else {
                // Insertar nueva
                await db.query(`
                    INSERT INTO categorias_catalogo (slug, nombre, icono, imagen, descripcion, orden, activo)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [slug.trim().toLowerCase(), nombre.trim(), icono || '📦', imagen || '', descripcion || '', ordenNum, esActivo]);
            }

            res.redirect('/admin/categorias?msg=guardado');
        } catch (err) {
            next(err);
        }
    }

    async eliminarCategoria(req, res, next) {
        try {
            const { id } = req.params;
            await db.query('DELETE FROM categorias_catalogo WHERE id = $1', [id]);
            res.redirect('/admin/categorias?msg=eliminado');
        } catch (err) {
            next(err);
        }
    }

    // --- MÓDULO VENTAS & PEDIDOS ---
    async listarVentas(req, res, next) {
        try {
            const { estado, medio_pago, search } = req.query;
            let conditions = [];
            let params = [];
            let pIdx = 1;

            if (estado && estado !== 'TODOS') {
                conditions.push(`p.estado = $${pIdx++}`);
                params.push(estado);
            }
            if (medio_pago && medio_pago !== 'TODOS') {
                conditions.push(`p.medio_pago = $${pIdx++}`);
                params.push(medio_pago);
            }
            if (search && search.trim() !== '') {
                conditions.push(`(p.codigo_pedido ILIKE $${pIdx} OR p.nombre_cliente ILIKE $${pIdx} OR p.email_cliente ILIKE $${pIdx} OR p.ruc ILIKE $${pIdx})`);
                params.push(`%${search.trim()}%`);
                pIdx++;
            }

            const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
            const queryText = `
                SELECT p.*,
                       (SELECT COUNT(*) FROM detalles_pedido WHERE pedido_id = p.id) as total_items
                FROM pedidos p
                ${whereClause}
                ORDER BY p.created_at DESC
            `;

            const resPedidos = await db.query(queryText, params);

            // Métricas de ventas
            const metricsRes = await db.query(`
                SELECT 
                    COUNT(*) as total_ordenes,
                    COALESCE(SUM(total), 0) as volumen_ventas,
                    COUNT(CASE WHEN estado = 'CONFIRMADO' THEN 1 END) as confirmados,
                    COUNT(CASE WHEN estado = 'EN_PREPARACION' THEN 1 END) as en_preparacion,
                    COUNT(CASE WHEN estado = 'DESPACHADO' THEN 1 END) as despachados,
                    COUNT(CASE WHEN estado = 'ENTREGADO' THEN 1 END) as entregados
                FROM pedidos
            `);

            res.render('admin/ventas', {
                title: 'Gestión de Ventas y Pedidos - Admin',
                pedidos: resPedidos.rows,
                metrics: metricsRes.rows[0],
                filters: { estado, medio_pago, search }
            });
        } catch (err) {
            next(err);
        }
    }

    async detalleVenta(req, res, next) {
        try {
            const { id } = req.params;
            const resPedido = await db.query('SELECT * FROM pedidos WHERE id = $1', [id]);
            if (resPedido.rows.length === 0) {
                return res.status(404).render('error', { title: 'No Encontrado', message: 'El pedido no existe', statusCode: 404 });
            }

            const pedido = resPedido.rows[0];
            const resItems = await db.query(`
                SELECT d.*, a.anilla, a.sexo, e.nombre as especie_nombre
                FROM detalles_pedido d
                LEFT JOIN aves a ON d.ave_id = a.id
                LEFT JOIN especies e ON a.especie_id = e.id
                WHERE d.pedido_id = $1
            `, [id]);

            res.render('admin/detalle_venta', {
                title: `Pedido ${pedido.codigo_pedido} - Admin`,
                pedido,
                items: resItems.rows
            });
        } catch (err) {
            next(err);
        }
    }

    async actualizarEstadoVenta(req, res, next) {
        try {
            const { id } = req.params;
            const { estado, notas } = req.body;

            await db.query(`
                UPDATE pedidos
                SET estado = $1, notas = COALESCE($2, notas), updated_at = NOW()
                WHERE id = $3
            `, [estado, notas, id]);

            res.redirect(`/admin/ventas/${id}?msg=actualizado`);
        } catch (err) {
            next(err);
        }
    }

    // --- MÓDULO PRODUCTOS MULTI-RUBRO ---
    async listarProductos(req, res, next) {
        try {
            const resProductos = await db.query(`
                SELECT p.*, c.nombre as categoria_nombre, c.icono as categoria_icono
                FROM productos_tienda p
                LEFT JOIN categorias_catalogo c ON p.categoria_id = c.id
                ORDER BY p.id DESC
            `);

            const resCategorias = await db.query('SELECT id, nombre FROM categorias_catalogo WHERE activo = true ORDER BY nombre');

            res.render('admin/productos', {
                title: 'Inventario & Productos - Admin',
                productos: resProductos.rows,
                categorias: resCategorias.rows,
                query: req.query
            });
        } catch (err) {
            next(err);
        }
    }

    async guardarProducto(req, res, next) {
        try {
            const { id, categoria_id, nombre, sku, precio_normal, precio_internet, precio_club, stock, foto_url, activo, descripcion } = req.body;
            const esActivo = activo === 'on' || activo === 'true' || activo === true;

            if (id) {
                await db.query(`
                    UPDATE productos_tienda
                    SET categoria_id = $1, nombre = $2, sku = $3, precio_normal = $4, precio_internet = $5, precio_club = $6, stock = $7, foto_url = $8, activo = $9, descripcion = $10
                    WHERE id = $11
                `, [categoria_id || null, nombre.trim(), sku.trim(), parseFloat(precio_normal) || 0, parseFloat(precio_internet) || 0, parseFloat(precio_club) || 0, parseInt(stock) || 0, foto_url || '', esActivo, descripcion || '', id]);
            } else {
                await db.query(`
                    INSERT INTO productos_tienda (categoria_id, nombre, sku, precio_normal, precio_internet, precio_club, stock, foto_url, activo, descripcion)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                `, [categoria_id || null, nombre.trim(), sku.trim(), parseFloat(precio_normal) || 0, parseFloat(precio_internet) || 0, parseFloat(precio_club) || 0, parseInt(stock) || 0, foto_url || '', esActivo, descripcion || '']);
            }

            res.redirect('/admin/productos?msg=guardado');
        } catch (err) {
            next(err);
        }
    }

    async eliminarProducto(req, res, next) {
        try {
            const { id } = req.params;
            await db.query('DELETE FROM productos_tienda WHERE id = $1', [id]);
            res.redirect('/admin/productos?msg=eliminado');
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AdminController();
