import dotenv from 'dotenv';
import app from './app.js';
import { pool } from './db.js';

dotenv.config();

const port = Number(process.env.API_PORT ?? 4000);

async function start() {
  await pool.query('select 1');

  app.listen(port, () => {
    console.log(`FitHub API escuchando en http://localhost:${port}/api`);
  });
}

start().catch((error) => {
  console.error('No se pudo iniciar la API.', error);
  process.exit(1);
});