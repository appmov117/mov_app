# Ruta

PWA para conectar pasajeros con conductores independientes en una zona piloto (Centro de Mérida).

La plataforma cobra una membresía de **$200 MXN / 30 días**. No procesa el pago del viaje: el pasajero paga efectivo o a la terminal del conductor, y el sistema solo guarda el monto declarado.

## Arranque local

Requisitos: Docker, [uv](https://docs.astral.sh/uv/) y Node 22.

```bash
docker compose up -d
cd backend && uv sync --all-groups && uv run uvicorn app.main:app --reload --port 8000
cd frontend && npm install && npm run dev
```

La app queda en http://localhost:5173 y la API en http://localhost:8000/api/v1.

La base es PostgreSQL + PostGIS.

## Despliegue en Render + Supabase

Un solo Web Service de Render sirve la PWA y el API desde el mismo dominio con el `Dockerfile` de la raíz. Supabase aloja la base y los archivos subidos.

1. En Supabase activa la extensión `postgis` (Database → Extensions) y crea un bucket privado llamado `uploads` (Storage).
2. En Render elige New → Blueprint y selecciona este repositorio; `render.yaml` crea el servicio.
3. Llena las variables que pide:

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | Cadena del Session pooler de Supabase con prefijo `postgresql+psycopg://` y `?sslmode=require` al final |
| `SUPABASE_URL` | `https://<proyecto>.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Clave `service_role` (Project Settings → API) |
| `PUBLIC_APP_URL`, `CORS_ORIGINS` | La URL `https://<servicio>.onrender.com` |
| `MAPBOX_ACCESS_TOKEN`, `VITE_MAPBOX_TOKEN` | Token de Mapbox |

`JWT_SECRET` lo genera Render. Tras el primer despliegue cambia `SEED` a `false`. Sin `SUPABASE_URL` los archivos se guardan en `backend/data/`.

## Cuentas demo

En la portada hay dos entradas directas, sin formulario:

| Quién | Rol | Correo | Contraseña |
| --- | --- | --- | --- |
| María | Pasajera | maria@ruta.local | Pasajero1234 |
| Ana | Conductora | ana@ruta.local | Conductor1234 |

También existen luis@ruta.local y marta@ruta.local (Conductor1234) y admin@ruta.local / Admin1234.

Ana, Luis y Marta ya están aprobados, con membresía vigente y conectados cerca del Centro.

## Flujo

1. El pasajero elige origen y destino y solicita el viaje.
2. La API ofrece el viaje a los 3 conductores más cercanos (2 km), espera y amplía el radio.
3. El primero que acepta se queda con el viaje. Los demás reciben la oferta expirada.
4. El conductor marca que va en camino, que llegó, inicia y al final registra cuánto cobró y cómo pagó el pasajero.
5. El pasajero califica o reporta.
6. El admin aprueba conductores, comprobantes de membresía y quejas.

Un conductor solo puede conectarse si está aprobado y tiene membresía vigente.

## Pruebas

```bash
cd backend && uv run ruff check app tests && uv run pytest
cd frontend && npm run build
```
admin@ruta.local / Admin1234.