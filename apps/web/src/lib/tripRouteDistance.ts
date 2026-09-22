/** Road route via public OSRM (same source as backend distance). */

export type DrivingRouteResult = {
  distanceKm: number;
  /** [lat, lng] pairs for map polyline */
  path: [number, number][];
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dlat = ((lat2 - lat1) * Math.PI) / 180;
  const dlon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dlon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

export async function fetchDrivingRoute(
  pickupLat: number,
  pickupLng: number,
  destLat: number,
  destLng: number,
): Promise<DrivingRouteResult> {
  const coords = `${pickupLng},${pickupLat};${destLng},${destLat}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("route failed");
    const data = (await res.json()) as {
      routes?: { distance?: number; geometry?: { coordinates?: [number, number][] } }[];
    };
    const route = data.routes?.[0];
    const meters = route?.distance ?? 0;
    const line = route?.geometry?.coordinates;
    if (meters > 0 && line && line.length >= 2) {
      return {
        distanceKm: Math.round((meters / 1000) * 100) / 100,
        path: line.map(([lng, lat]) => [lat, lng] as [number, number]),
      };
    }
  } catch {
    /* fall through */
  }
  const straight = haversineKm(pickupLat, pickupLng, destLat, destLng);
  return {
    distanceKm: Math.round(straight * 100) / 100,
    path: [
      [pickupLat, pickupLng],
      [destLat, destLng],
    ],
  };
}

export function tripHasSavedRoute(trip: {
  pickupLatitude: number;
  pickupLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
  routeDistanceKm: number;
}): boolean {
  if (trip.routeDistanceKm > 0) return true;
  const pickupSet = trip.pickupLatitude !== 0 || trip.pickupLongitude !== 0;
  const destSet = trip.destinationLatitude !== 0 || trip.destinationLongitude !== 0;
  return pickupSet && destSet;
}
