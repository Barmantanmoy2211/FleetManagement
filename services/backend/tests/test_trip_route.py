from app.services.trip_route import haversine_km, driving_route_distance_km


def test_haversine_km_positive():
    d = haversine_km(22.5726, 88.3639, 22.6102, 88.4011)
    assert 4.0 < d < 8.0


def test_driving_route_falls_back_without_network(monkeypatch):
    def fail(*args, **kwargs):
        raise OSError("offline")

    monkeypatch.setattr(
        "app.services.trip_route.urllib.request.urlopen",
        fail,
    )
    d = driving_route_distance_km(22.5726, 88.3639, 22.6102, 88.4011)
    assert d > 0
