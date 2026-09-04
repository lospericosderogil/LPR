const db = require('../../src/config/db');

async function migrate() {
    console.log('Actualizando fn_manejar_ausencia_ave()...');
    const sql = `
    CREATE OR REPLACE FUNCTION fn_manejar_ausencia_ave()
    RETURNS TRIGGER AS $$
    BEGIN
        -- Si el ave deja de estar disponible en el criadero, forzar retiro de venta comercial y desactivar reservas/parejas
        IF NEW.estado_biologico IN ('MUERTO', 'PERDIDO', 'DONADO', 'INTERCAMBIADO', 'VENDIDO') THEN
            NEW.estado_comercial := 'NO_VENTA';

            -- Desactivar reservas temporales asociadas
            UPDATE reservas_temporales SET activo = FALSE WHERE ave_id = NEW.id;

            -- Cerrar parejas reproductivas activas de este ejemplar
            UPDATE parejas 
            SET activo = FALSE, fecha_fin = CURRENT_DATE, 
                comentario = CONCAT(COALESCE(comentario, ''), ' | Cerrada automáticamente por cambio de estado del ejemplar a: ', NEW.estado_biologico)
            WHERE (macho_id = NEW.id OR hembra_id = NEW.id) AND activo = TRUE;
        END IF;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    `;

    await db.query(sql);
    console.log('✔ fn_manejar_ausencia_ave() actualizada exitosamente.');
    process.exit(0);
}

migrate().catch(err => {
    console.error('❌ Error migrando trigger:', err);
    process.exit(1);
});
