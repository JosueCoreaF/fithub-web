# FitHub - Gestión Deportiva

FitHub centraliza personas, actividades, reservas, membresías y pagos para reemplazar la operación dispersa en WhatsApp y hojas de cálculo.

## Alcance actual

- Frontend administrativo en React + Vite.
- Backend REST en Express + PostgreSQL.
- Scripts SQL para esquema, seed y accesos administrativos.
- Colección de Postman para CRUD de Personas, Actividades, Reservas y Pagos.

## Requisitos

- Node.js 18 o superior.
- Base PostgreSQL accesible desde `DATABASE_URL`.
- Variables de entorno en `.env` basadas en `.env.example`.

## Variables de entorno

```env
VITE_SUPABASE_URL=tu_url_de_supabase
VITE_SUPABASE_ANON_KEY=tu_anon_key_de_supabase
VITE_MEDIA_BUCKET=fithub-media
VITE_API_BASE_URL=http://localhost:4000/api
DATABASE_URL=postgresql://postgres:password@localhost:5432/fithub
API_PORT=4000
NODE_ENV=development
```

Las variables `VITE_*` solo cubren el frontend. Para arrancar la API necesitas además una conexión PostgreSQL real en `DATABASE_URL` o `SUPABASE_DB_URL`.

Si usas Supabase, obtén esa cadena en `Project Settings > Database > Connection string`.

## Scripts

```bash
npm run dev        # frontend Vite
npm run api:dev    # backend REST con recarga
npm run api:start  # backend REST
npm run api:check  # chequeo tipado del backend
npm run build      # build del frontend
```

## Orden sugerido de arranque

1. Ejecutar [sql/schema.sql](sql/schema.sql) en PostgreSQL o Supabase SQL Editor.
2. Ejecutar [sql/seed.sql](sql/seed.sql).
3. Si usarás fotos compartidas entre dispositivos, ejecutar [sql/storage_media_bucket.sql](sql/storage_media_bucket.sql) en Supabase SQL Editor.
4. Levantar la API con `npm run api:dev`.
5. Levantar el frontend con `npm run dev`.

## Recursos REST mínimos

- `GET|POST|PUT|DELETE /api/personas`
- `GET|POST|PUT|DELETE /api/actividades`
- `GET|POST|PUT|DELETE /api/reservas`
- `GET|POST|PUT|DELETE /api/pagos`
- `PUT /api/configuracion-operativa`
- `GET /api/bootstrap`
- `GET /api/health`

## Entregables incluidos

- Coleccion Postman en [postman/FitHub.postman_collection.json](postman/FitHub.postman_collection.json).
- Entorno Postman en [postman/FitHub.postman_environment.json](postman/FitHub.postman_environment.json).
- Modelos conceptual y logico en [docs/fithub-models.md](docs/fithub-models.md).
- Script de Storage para fotos en [sql/storage_media_bucket.sql](sql/storage_media_bucket.sql).

## Fotos y Storage

- La app intenta guardar imágenes en Supabase Storage usando el bucket configurado en `VITE_MEDIA_BUCKET`.
- Si el bucket no existe o no tiene políticas válidas, la app hace fallback automático al almacenamiento local del navegador.
- Para persistencia real entre dispositivos, ejecuta [sql/storage_media_bucket.sql](sql/storage_media_bucket.sql) y mantén `VITE_MEDIA_BUCKET=fithub-media` o ajusta ambos al mismo nombre.

## Reglas de negocio ya cubiertas por el backend

- Evita reservas duplicadas del mismo cliente para la misma actividad.
- Evita sobreventa por cupo máximo.
- Evita pagos que excedan el saldo de una reserva o membresía.
- Evita asignar al mismo entrenador en dos actividades al mismo horario.
- Maneja errores de validación y conflictos de integridad.