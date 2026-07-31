require('dotenv').config();
const { Pool } = require('pg');
const logger = require('./logger');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
});

pool.on('error', (err) => {
  logger.error(`Erreur inattendue du pool PostgreSQL : ${err.message}`);
});

async function query(text, params) {
  const debut = Date.now();
  const resultat = await pool.query(text, params);
  logger.debug(`SQL: ${text} — ${Date.now() - debut}ms — ${resultat.rowCount} ligne(s)`);
  return resultat;
}

async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultat = await callback(client);
    await client.query('COMMIT');
    return resultat;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, transaction };
