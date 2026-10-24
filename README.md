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

La base es PostgreSQL + PostGIS. En producción apunta `DATABASE_URL` al proyecto de Supabase y el API se despliega en Railway con `backend/Dockerfile`.

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