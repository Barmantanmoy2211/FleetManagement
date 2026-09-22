from __future__ import annotations

import json
import math
import urllib.error
import urllib.request


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    )
    return 2 * r * math.asin(math.sqrt(a))


def driving_route_distance_km(
    pickup_lat: float,
    pickup_lng: float,
    destination_lat: float,
    destination_lng: float,
    *,
    timeout_sec: float = 8.0,
) -> float:
    """Road distance via public OSRM; falls back to straight-line km if unavailable."""
    coords = f"{pickup_lng},{pickup_lat};{destination_lng},{destination_lat}"
    url = (
        "https://router.project-osrm.org/route/v1/driving/"
        f"{coords}?overview=false"
    )
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "FleetManagement/1.0"})
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            data = json.loads(resp.read().decode())
        routes = data.get("routes") or []
        if routes:
            meters = float(routes[0].get("distance", 0))
            if meters > 0:
                return round(meters / 1000.0, 2)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError, KeyError):
        pass
    return round(
        haversine_km(pickup_lat, pickup_lng, destination_lat, destination_lng), 2
    )
