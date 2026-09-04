const db = require('../config/db');
const aveService = require('../services/ave.service');
const reservaService = require('../services/reserva.service');
const emailService = require('../services/email.service');

class ShopController {
    async listarCatalogo(req, res, next) {
        try {
            const filters = {
                catalogo_publico: true,
                sexo: req.query.sexo || null,
                especie_id: req.query.especie_id || null,
                search: req.query.search || null
            };

            const aves = await aveService.listarAves(filters);
            const especies = await db.query('SELECT * FROM especies WHERE activo = true');
            
            res.render('shop/catalogo', { title: 'Catálogo', aves, especies: especies.rows, query: req.query });
        } catch (err) {
            next(err);
        }
    }

    async detalleAve(req, res, next) {
        try {
            const { id } = req.params;
            const ave = await aveService.obtenerAveConDetalles(id);

            // Validar visibilidad pública según las reglas de catálogo
            let esPublicable = false;
            if (ave && ave.estado_publicacion === 'EXHIBICION') {
                if (!['VENDIDO', 'INTERCAMBIADO'].includes(ave.estado_biologico)) {
                    esPublicable = true;
                } else if (ave.estado_biologico === 'VENDIDO') {
                    const fVentaStr = (ave.estado_detalles && ave.estado_detalles.fecha_venta) ? ave.estado_detalles.fecha_venta : ave.created_at;
                    const diffDias = (new Date() - new Date(fVentaStr)) / (1000 * 60 * 60 * 24);
                    esPublicable = diffDias <= 10;
                } else if (ave.estado_biologico === 'INTERCAMBIADO') {
                    const fCambioStr = (ave.estado_detalles && ave.estado_detalles.fecha_cambio) ? ave.estado_detalles.fecha_cambio : ave.created_at;
                    const diffDias = (new Date() - new Date(fCambioStr)) / (1000 * 60 * 60 * 24);
                    esPublicable = diffDias <= 10;
                }
            }

            if (!esPublicable) {
                return res.status(404).render('error', { title: 'No Encontrada', message: 'El ave no está disponible para visualización pública en el catálogo.', statusCode: 404 });
            }

            res.render('shop/detalle', { title: ave.anilla || `Ave #${ave.id}`, ave });
        } catch (err) {
            next(err);
        }
    }

    async agregarAlCarrito(req, res, next) {
        try {
            const { aveId } = req.body;
            const usuarioId = req.session.user.id;

            const expiraAt = await reservaService.crearReservaTemporal(parseInt(aveId), usuarioId);
            
            // Cargar datos del ave para el correo
            const ave = await aveService.obtenerAveConDetalles(parseInt(aveId));
            if (ave) {
                emailService.enviarNotificacionReserva(req.session.user, ave, expiraAt).catch(err => {
                    console.error('❌ Error enviando correo de reserva:', err.message);
                });
            }

            res.json({ 
                success: true, 
                message: 'Ave reservada temporalmente por 10 minutos.', 
                expiraAt 
            });
        } catch (err) {
            res.status(400).json({ success: false, error: err.message });
        }
    }

    async quitarDelCarrito(req, res, next) {
        try {
            const { aveId } = req.body;
            const usuarioId = req.session.user.id;

            await reservaService.liberarReservaTemporal(parseInt(aveId), usuarioId);
            res.json({ success: true, message: 'Reserva liberada.' });
        } catch (err) {
            res.status(400).json({ success: false, error: err.message });
        }
    }

    async verCheckout(req, res, next) {
        try {
            const usuarioId = req.session.user.id;
            
            const queryText = `
                SELECT r.*, a.anilla, a.precio_venta, 
                       (SELECT url FROM imagenes_ave WHERE ave_id = a.id AND es_principal = true LIMIT 1) as foto
                FROM reservas_temporales r
                JOIN aves a ON r.ave_id = a.id
                WHERE r.usuario_id = $1 AND r.activo = true AND r.expira_at > NOW()
            `;
            const resRes = await db.query(queryText, [usuarioId]);
            const reservas = resRes.rows;

            let total = 0;
            reservas.forEach(r => {
                total += parseFloat(r.precio_venta || 0);
            });

            res.render('shop/checkout', { title: 'Checkout - Carrito', reservas, total });
        } catch (err) {
            next(err);
        }
    }

    async procesarCompra(req, res, next) {
        const client = await db.getClient();
        try {
            const usuarioId = req.session.user.id;
            const { referencia_pago } = req.body;

            await client.query('BEGIN');
            await client.query(`SET LOCAL app.current_user_id = ${usuarioId}`);

            // 1. Cargar reservas temporales activas del usuario
            const queryRes = await client.query(
                'SELECT r.*, a.precio_venta FROM reservas_temporales r JOIN aves a ON r.ave_id = a.id WHERE r.usuario_id = $1 AND r.activo = true AND r.expira_at > NOW()',
                [usuarioId]
            );

            const reservas = queryRes.rows;
            if (reservas.length === 0) {
                throw new Error('Tu carrito está vacío o tus reservas han expirado.');
            }

            let total = 0;
            reservas.forEach(r => total += parseFloat(r.precio_venta));

            // 2. Crear el Pedido
            const resPedido = await client.query(
                "INSERT INTO pedidos (usuario_id, total, referencia_pago, estado) VALUES ($1, $2, $3, 'PAGADO') RETURNING *",
                [usuarioId, total, referencia_pago || 'PAGO_MANUAL']
            );
            const pedido = resPedido.rows[0];

            // 3. Crear detalles y actualizar estado de aves
            const detallesCompra = [];
            for (const resv of reservas) {
                await client.query(
                    'INSERT INTO detalles_pedido (pedido_id, ave_id, precio_historico) VALUES ($1, $2, $3)',
                    [pedido.id, resv.ave_id, resv.precio_venta]
                );

                await client.query(
                    "UPDATE aves SET estado_biologico = 'VENDIDO', estado_comercial = 'NO_VENTA', estado_detalles = jsonb_set(COALESCE(estado_detalles, '{}'::jsonb), '{fecha_venta}', to_jsonb(CURRENT_DATE::text)), estado_publicacion = 'EXHIBICION' WHERE id = $1",
                    [resv.ave_id]
                );

                await client.query(
                    'UPDATE reservas_temporales SET activo = false WHERE ave_id = $1',
                    [resv.ave_id]
                );

                const details = await aveService.obtenerAveConDetalles(resv.ave_id);
                if (details) {
                    detallesCompra.push(details);
                }
            }

            await client.query('COMMIT');

            // Enviar correo de confirmación de compra
            emailService.enviarConfirmacionCompra(req.session.user, pedido, detallesCompra).catch(err => {
                console.error('❌ Error enviando correo de confirmación de compra:', err.message);
            });

            res.render('shop/home', { title: 'Compra Exitosa', successMessage: `¡Gracias por tu compra! Tu pedido #${pedido.id} ha sido procesado con éxito.` });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('❌ Error procesando compra:', err.message);
            res.status(400).render('error', { title: 'Error en Pago', message: err.message, statusCode: 400 });
        } finally {
            client.release();
        }
    }
}

module.exports = new ShopController();
