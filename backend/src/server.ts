import dotenv from 'dotenv';
import app from './app.js';
import { pool } from './db.js';

dotenv.config();

const port = Number(process.env.API_PORT ?? 4000);

async function ensureHotelPricingSchema() {
  await pool.query(`
    alter table if exists public.configuracion_hotelera
      add column if not exists moneda_alterna text not null default 'HNL',
      add column if not exists tipo_cambio_base numeric(12, 6) not null default 24.5,
      add column if not exists tipo_cambio_actualizado_en timestamptz not null default now(),
      add column if not exists descuento_tercera_edad numeric(5, 2) not null default 0,
      add column if not exists edad_tercera_edad integer not null default 60;

    create table if not exists public.tarifas_personalizadas_hotel (
      id_tarifa_personalizada uuid primary key default gen_random_uuid(),
      id_hotel uuid not null references public.hoteles(id_hotel) on delete cascade,
      id_habitacion uuid references public.habitaciones(id_habitacion) on delete set null,
      nombre_tarifa text not null,
      descripcion text,
      moneda text not null default 'USD',
      monto_noche numeric(10, 2) not null default 0,
      activa boolean not null default true,
      prioridad integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint tarifas_personalizadas_hotel_moneda_check check (moneda in ('USD', 'HNL')),
      constraint tarifas_personalizadas_hotel_monto_check check (monto_noche >= 0)
    );

    alter table if exists public.tarifas_personalizadas_hotel
      alter column id_habitacion drop not null;

    create index if not exists idx_tarifas_personalizadas_hotel_room
      on public.tarifas_personalizadas_hotel (id_habitacion, activa, prioridad desc, updated_at desc);

    drop trigger if exists tarifas_personalizadas_hotel_set_updated_at on public.tarifas_personalizadas_hotel;
    create trigger tarifas_personalizadas_hotel_set_updated_at
    before update on public.tarifas_personalizadas_hotel
    for each row execute function public.set_updated_at();
  `);
}

async function start() {
  await pool.query('select 1');
  await ensureHotelPricingSchema();

  app.listen(port, () => {
    console.log(`FitHub API escuchando en http://localhost:${port}/api`);
  });
}

start().catch((error) => {
  console.error('No se pudo iniciar la API.', error);
  process.exit(1);
});