const { Pool } = require('pg');
require('dotenv').config();

const connectionString = (process.env.DATABASE_URL || '').trim();

const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1') || (!connectionString && (!process.env.DB_HOST || process.env.DB_HOST === 'localhost' || process.env.DB_HOST === '127.0.0.1'));

let sslValue = { rejectUnauthorized: false };
if (process.env.DB_SSL === 'false') {
    sslValue = false;
} else if (process.env.DB_SSL === 'true') {
    sslValue = { rejectUnauthorized: false };
} else if (isLocal) {
    sslValue = false;
}

const poolSettings = {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    ssl: sslValue
};

const poolConfig = connectionString 
    ? { connectionString, ...poolSettings }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'db_lpr',
        ...poolSettings
    };

const pool = new Pool(poolConfig);

const isConnectionStringLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
const dbLocation = isConnectionStringLocal || isLocal ? 'PostgreSQL Local (db_lpr)' : 'Supabase Nube';
console.log(`🔍 [DB]: Conectado a ${dbLocation}`);

pool.on('error', (err) => {
    console.error('❌ Error en pg Pool:', err.message);
});

module.exports = {
    query: async (text, params) => {
        try {
            return await pool.query(text, params);
        } catch (err) {
            console.error(`❌ SQL ERROR: ${err.message} | QUERY: ${text.slice(0, 100)}...`);
            throw err;
        }
    },
    getClient: () => pool.connect(),
    pool
};
