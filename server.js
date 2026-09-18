const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const db = require('./src/config/db');
const errorMiddleware = require('./src/middlewares/error.middleware');
const aveService = require('./src/services/ave.service');

const app = express();
const PORT = process.env.PORT || 3010;

// Security Middlewares
if (process.env.NODE_ENV === 'production') {
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false
    }));
} else {
    // En desarrollo local (localhost), desactivamos CSP y HSTS para evitar ERR_SSL_PROTOCOL_ERROR
    app.use(helmet({
        contentSecurityPolicy: false,
        hsts: false
    }));
    app.use((req, res, next) => {
        res.setHeader('Strict-Transport-Security', 'max-age=0');
        next();
    });
}
app.use(cors());
app.use(morgan('dev'));

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust proxy para entornos detrás de proxies inversos (Render, Heroku, etc.)
if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    app.set('trust proxy', 1);
}

// Session con persistencia
app.use(session({
    store: new pgSession({
        pool: db.pool,
        tableName: 'session',
        createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET || 'aviperu_super_secret_session_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' || !!process.env.RENDER,
        sameSite: 'lax'
    }
}));

// Servir estáticos
app.use(express.static(path.join(__dirname, 'src/public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Motor de plantillas (EJS)
app.set('views', path.join(__dirname, 'src/views'));
app.set('view engine', 'ejs');

// Variables locales disponibles en todas las vistas
app.use((req, res, next) => {
    res.locals.user = (req.session && req.session.user) ? req.session.user : null;
    next();
});

// Importar Enrutadores
const authRoutes = require('./src/routes/auth.routes');
const adminRoutes = require('./src/routes/admin.routes');
const shopRoutes = require('./src/routes/shop.routes');

app.use('/', authRoutes);
app.use('/admin', adminRoutes);
app.use('/', shopRoutes);

// Home principal con ejemplares destacados y datos para Smart Matchmaker
app.get('/', async (req, res) => {
    try {
        const aves = await aveService.listarAves({ catalogo_publico: true });
        const especiesRes = await db.query('SELECT id, nombre FROM especies WHERE activo = true ORDER BY id');
        const mutacionesRes = await db.query('SELECT id, nombre FROM mutaciones WHERE activo = true ORDER BY nombre');

        res.render('shop/home', { 
            title: 'AviPeru 2026 - Genética & Crianza de Élite', 
            aves: aves.slice(0, 6),
            especies: especiesRes.rows || [],
            mutaciones: mutacionesRes.rows || []
        });
    } catch (err) {
        console.error('❌ Error cargando datos para la home:', err.message);
        res.render('shop/home', { 
            title: 'Inicio - AviPeru', 
            aves: [],
            especies: [],
            mutaciones: []
        });
    }
});

// Cron Job: Liberación automática de reservas expiradas (cada minuto)
const cron = require('node-cron');
cron.schedule('* * * * *', async () => {
    console.log('⏰ [Cron]: Ejecutando limpieza de reservas temporales expiradas...');
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        
        // Obtener reservas activas que ya expiraron
        const resExpired = await client.query(`
            SELECT ave_id FROM reservas_temporales 
            WHERE expira_at < NOW() AND activo = true
        `);
        
        if (resExpired.rows.length > 0) {
            const aveIds = resExpired.rows.map(r => r.ave_id);
            
            // Retornar aves a EN_VENTA si siguen en estado EN_VENTA
            await client.query(`
                UPDATE aves 
                SET estado_comercial = 'EN_VENTA' 
                WHERE id = ANY($1) AND estado_biologico = 'EN_VENTA'
            `, [aveIds]);

            // Desactivar las reservas
            await client.query(`
                UPDATE reservas_temporales 
                SET activo = false 
                WHERE ave_id = ANY($1)
            `, [aveIds]);

            console.log(`✔ [Cron]: Liberadas ${aveIds.length} aves de reservas expiradas: ${aveIds.join(', ')}`);
        }
        
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ [Cron Error]:', err.message);
    } finally {
        client.release();
    }
});

// Manejador central de errores
app.use(errorMiddleware);

app.listen(PORT, () => {
    console.log(`🚀 [Server]: Plataforma AviPeru activa en http://localhost:${PORT}`);
});
