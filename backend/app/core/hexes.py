"""Agrupación de puntos en hexágonos H3 para mapas de calor y de demanda."""

from collections.abc import Iterable

import h3


def hex_features(points: Iterable[tuple[float, float, dict]], resolution: int) -> list[dict]:
    """Cuenta los puntos por hexágono y devuelve una Feature GeoJSON por hexágono.

    Args:
        points: Tuplas (latitud, longitud, propiedades a sumar), p. ej. {"unserved": 1}.
        resolution: Resolución H3 (8 ≈ 0.7 km², 9 ≈ 0.1 km²).

    Returns:
        Features con `cell`, `count`, el centro del hexágono y la suma de cada propiedad.
    """
    cells: dict[str, dict] = {}
    for lat, lng, extra in points:
        cell = h3.latlng_to_cell(lat, lng, resolution)
        props = cells.setdefault(cell, {"cell": cell, "count": 0})
        props["count"] += 1
        for key, value in extra.items():
            props[key] = props.get(key, 0) + value
    features = []
    for cell, props in cells.items():
        ring = [[lng, lat] for lat, lng in h3.cell_to_boundary(cell)]
        center_lat, center_lng = h3.cell_to_latlng(cell)
        features.append(
            {
                "type": "Feature",
                "properties": props | {"latitude": center_lat, "longitude": center_lng},
                "geometry": {"type": "Polygon", "coordinates": [ring + ring[:1]]},
            }
        )
    return features
