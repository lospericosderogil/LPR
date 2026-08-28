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

const app = express();
const PORT = process.env.PORT || 3010;

// Security Middlewares
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https://*.supabase.co"],
            connectSrc: ["'self'", "https://*.supabase.co"]
        }
    }
}));
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
    secret: process.env.SESSION_SECRET || 'prompt_maestro_super_secret_session_key',
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

// Home temporal
app.get('/', (req, res) => {
    res.render('shop/home', { title: 'Inicio - Prompt Maestro' });
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
            
            // Retornar aves a EN_VENTA si siguen DISPONIBLES
            await client.query(`
                UPDATE aves 
                SET estado_comercial = 'EN_VENTA' 
                WHERE id = ANY($1) AND estado_biologico = 'DISPONIBLE'
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
    console.log(`🚀 [Server]: Plataforma Prompt Maestro activa en http://localhost:${PORT}`);
});
