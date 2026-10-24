# Favoritos y paradas ordenadas

## Objetivo

Permitir que cada pasajero guarde lugares favoritos desde los resultados de geocodificación y que los viajes con varias paradas avancen explícitamente, en orden, bajo control del conductor.

## Favoritos

- Los favoritos pertenecen a la cuenta del pasajero y usan la tabla existente `saved_places`.
- La pantalla de inicio consulta `GET /api/v1/passengers/me/places`.
- Al escribir tres o más caracteres se muestran los resultados reales de `GET /api/v1/geo/search`.
- Cada resultado tiene una estrella para guardarlo mediante `POST /api/v1/passengers/me/places`.
- Cada favorito puede quitarse con `DELETE /api/v1/passengers/me/places/{id}`.
- Sin una búsqueda activa, la lista muestra los favoritos de la cuenta; si todavía no hay favoritos, muestra los accesos sugeridos actuales.

## Paradas ordenadas

- La solicitud persiste las coordenadas de las paradas intermedias en el orden elegido.
- El viaje conserva `current_stop_index` y `stop_arrived`.
- Al iniciar, el conductor navega hacia la primera parada pendiente.
- En una parada, el conductor pulsa `Llegué al punto N`; la API marca la parada como alcanzada.
- Después debe pulsar `Continuar al siguiente`. La API incrementa el índice y vuelve a mostrar la ruta pendiente.
- Después de la última parada, el siguiente objetivo es el destino final y vuelve a estar disponible `Finalizar`.
- El pasajero ve el progreso actual y la ruta pendiente mediante la misma respuesta activa.

## Reglas

- Máximo cuatro paradas intermedias.
- Solo el conductor asignado puede avanzar paradas.
- No se avanza automáticamente por GPS.
- La API rechaza llegar o continuar fuera del estado `in_progress`.
- Se mantiene la tarifa total calculada sobre toda la ruta.
