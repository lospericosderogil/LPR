const db = require('../config/db');

class ReservaService {
    async crearReservaTemporal(aveId, usuarioId) {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            // 1. Bloquear la fila del ave para evitar concurrencia
            const resAve = await client.query(
                'SELECT estado_comercial, estado_biologico, precio_venta FROM aves WHERE id = $1 FOR UPDATE',
                [aveId]
            );

            if (resAve.rows.length === 0) {
                throw new Error('El ave seleccionada no existe.');
            }

            const ave = resAve.rows[0];

            if (ave.estado_biologico !== 'DISPONIBLE') {
                throw new Error('El ejemplar ya no está disponible (vendido o ausente).');
            }

            if (ave.estado_comercial !== 'EN_VENTA') {
                // Verificar si está reservada por el mismo usuario
                const resActive = await client.query(
                    'SELECT expira_at FROM reservas_temporales WHERE ave_id = $1 AND usuario_id = $2 AND expira_at > NOW() AND activo = true',
                    [aveId, usuarioId]
                );
                if (resActive.rows.length > 0) {
                    // Ya la tiene reservada él, retornar la expiración existente
                    await client.query('COMMIT');
                    return resActive.rows[0].expira_at;
                }
                throw new Error('El ave ya se encuentra reservada o no está a la venta.');
            }

            // 2. Crear la reserva de 10 minutos
            const expiraAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos
            await client.query(
                'INSERT INTO reservas_temporales (ave_id, usuario_id, expira_at) VALUES ($1, $2, $3) ON CONFLICT (ave_id) DO UPDATE SET usuario_id = EXCLUDED.usuario_id, reservado_at = NOW(), expira_at = EXCLUDED.expira_at, activo = true',
                [aveId, usuarioId, expiraAt]
            );

            // 3. Cambiar estado comercial del ave
            await client.query(
                "UPDATE aves SET estado_comercial = 'RESERVADA' WHERE id = $1",
                [aveId]
            );

            await client.query('COMMIT');
            return expiraAt;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    async liberarReservaTemporal(aveId, usuarioId) {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            const res = await client.query(
                'SELECT 1 FROM reservas_temporales WHERE ave_id = $1 AND usuario_id = $2 AND activo = true',
                [aveId, usuarioId]
            );

            if (res.rows.length > 0) {
                await client.query(
                    'UPDATE reservas_temporales SET activo = false WHERE ave_id = $1',
                    [aveId]
                );
                await client.query(
                    "UPDATE aves SET estado_comercial = 'EN_VENTA' WHERE id = $1 AND estado_biologico = 'DISPONIBLE'",
                    [aveId]
                );
            }

            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
}

module.exports = new ReservaService();
