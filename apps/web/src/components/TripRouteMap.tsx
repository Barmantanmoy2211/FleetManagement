import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchDrivingRoute } from "@/lib/tripRouteDistance";

type Props = {
  pickupLatitude: number;
  pickupLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
  routeDistanceKm?: number | null;
  /** Called when OSRM (or fallback) distance is computed for the current points. */
  onRouteDistanceComputed?: (km: number) => void;
  className?: string;
  heightClass?: string;
  showPlaceholder?: boolean;
};

export function TripRouteMap({
  pickupLatitude,
  pickupLongitude,
  destinationLatitude,
  destinationLongitude,
  routeDistanceKm,
  onRouteDistanceComputed,
  className,
  heightClass = "h-72",
  showPlaceholder = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [computedKm, setComputedKm] = useState<number | null>(null);

  const hasRoute =
    pickupLatitude !== 0 ||
    pickupLongitude !== 0 ||
    destinationLatitude !== 0 ||
    destinationLongitude !== 0;

  const displayKm =
    routeDistanceKm != null && routeDistanceKm > 0
      ? routeDistanceKm
      : computedKm;

  useEffect(() => {
    if (!containerRef.current || !hasRoute) {
      setComputedKm(null);
      return;
    }

    let cancelled = false;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(containerRef.current, { scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    mapRef.current = map;

    void fetchDrivingRoute(
      pickupLatitude,
      pickupLongitude,
      destinationLatitude,
      destinationLongitude,
    ).then((route) => {
      if (cancelled || !mapRef.current) return;

      setComputedKm(route.distanceKm);
      onRouteDistanceComputed?.(route.distanceKm);

      L.circleMarker([pickupLatitude, pickupLongitude], {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: "#059669",
        fillOpacity: 1,
      })
        .bindTooltip("Pickup", { permanent: true, direction: "top", offset: [0, -6] })
        .addTo(map);

      L.circleMarker([destinationLatitude, destinationLongitude], {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: "#dc2626",
        fillOpacity: 1,
      })
        .bindTooltip("Destination", { permanent: true, direction: "top", offset: [0, -6] })
        .addTo(map);

      L.polyline(route.path, { color: "#34d399", weight: 4, opacity: 0.85 }).addTo(map);

      const bounds = L.latLngBounds(route.path);
      map.fitBounds(bounds.pad(0.15));
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [
    pickupLatitude,
    pickupLongitude,
    destinationLatitude,
    destinationLongitude,
    hasRoute,
  ]);

  if (!hasRoute) {
    if (!showPlaceholder) return null;
    return (
      <p className={`text-sm text-slate-500 ${className ?? ""}`}>
        Set pickup and destination coordinates to preview the route.
      </p>
    );
  }

  return (
    <div className={className}>
      {displayKm != null && displayKm > 0 && (
        <p className="mb-2 text-sm text-slate-300">
          Route distance (shortest driving route):{" "}
          <span className="font-medium text-white">{displayKm.toFixed(2)} km</span>
        </p>
      )}
      <div
        ref={containerRef}
        className={`${heightClass} w-full rounded-lg border border-slate-800`}
      />
    </div>
  );
}
