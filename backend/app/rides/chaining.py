"""Viaje siguiente: ofrecer una solicitud a quien está por dejar a su pasajero."""

from app.rides import repository
from app.rides.ranking import MAX_CANDIDATES, Candidate, Leg, road_legs
from sqlalchemy.orm import Session

# Solo se encadena si al viaje actual le faltan como mucho 5 minutos.
FINISHING_S = 300
# Respaldo sin Matrix API: velocidad urbana promedio de 25 km/h.
URBAN_MPS = 25_000 / 3600


def finishing_candidates(
    db: Session, origin: dict, radius_m: int, excluded: list, service: str, destination: dict
) -> list[tuple[Candidate, Leg]]:
    """Conductores que terminan pronto, con su tiempo total hasta la nueva recogida.

    Args:
        db: Sesión de base de datos.
        origin: Punto de recogida con `latitude` y `longitude`.
        radius_m: Radio de búsqueda alrededor de la recogida, medido desde el destino actual.
        excluded: Conductores que ya recibieron esta solicitud.
        service: Servicio pedido; solo cuentan los conductores con el vehículo que le corresponde.
        destination: Destino del viaje nuevo, para respetar la zona de trabajo de cada conductor.

    Returns:
        Pares (candidato, recorrido). El recorrido suma lo que falta del viaje actual más el
        trayecto de ese destino a la recogida; la distancia es solo la de ese último tramo.
    """
    rows = repository.find_finishing(
        db, origin["latitude"], origin["longitude"], radius_m, MAX_CANDIDATES, excluded, service, destination
    )
    if not rows:
        return []
    here = [{"latitude": row.lat, "longitude": row.lng} for row in rows]
    ends = [{"latitude": row.end_lat, "longitude": row.end_lng} for row in rows]
    remaining = road_legs(here, ends)
    onward = road_legs(ends, [origin])
    result = []
    for index, row in enumerate(rows):
        left = remaining[index][index].seconds if remaining else None
        if left is None:
            left = row.to_end_m / URBAN_MPS
        if left > FINISHING_S:
            continue
        leg = onward[index][0] if onward else Leg(None, None)
        meters = leg.meters if leg.meters is not None else row.end_to_pickup_m
        seconds = leg.seconds if leg.seconds is not None else row.end_to_pickup_m / URBAN_MPS
        candidate = Candidate(row.id, row.end_lat, row.end_lng, row.end_to_pickup_m, False)
        result.append((candidate, Leg(left + seconds, meters)))
    return result
