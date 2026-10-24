# Favoritos, paradas y ajuste de recogida — Plan de implementación

> **Para agentes:** ejecutar con desarrollo guiado por pruebas, sin crear commits salvo solicitud explícita.

**Objetivo:** Añadir favoritos persistentes, progreso manual por paradas y controles para cancelar o ajustar el punto de encuentro.

**Arquitectura:** La API reutiliza `saved_places` y añade estado JSON/índice a solicitudes y viajes. El frontend consume CRUD de lugares y representa la parada activa; el conductor controla las transiciones. El ajuste de recogida es estado local previo a crear la solicitud.

**Stack:** FastAPI, SQLAlchemy, PostgreSQL/PostGIS, Alembic, React, TypeScript, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-09-21-favoritos-paradas-design.md`

## Tareas

### 1. Favoritos por cuenta
- [ ] Escribir pruebas API para listar, crear y borrar lugares propios.
- [ ] Verificar que fallen por falta de listado.
- [ ] Añadir `GET /passengers/me/places` y completar CRUD.
- [ ] Conectar resultados de geocodificación y estrellas en `PassengerHome`.

### 2. Paradas ordenadas
- [ ] Escribir pruebas del orden y de las transiciones llegar/continuar.
- [ ] Crear migración para `stops`, `current_stop_index` y `stop_arrived`.
- [ ] Persistir y presentar las paradas.
- [ ] Añadir endpoints exclusivos del conductor.
- [ ] Actualizar pantallas de conductor y pasajero.

### 3. Ajuste de recogida
- [ ] Añadir modo de mapa para mover el origen y aceptarlo.
- [ ] Añadir Cancelar en la selección de servicio.
- [ ] Verificar que aceptar recalcula ruta, duración y precio.

### 4. Verificación
- [ ] Ejecutar pruebas backend.
- [ ] Ejecutar TypeScript y diagnóstico del editor.
- [ ] Verificar los flujos en navegador.
