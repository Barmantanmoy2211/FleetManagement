/** Default demo coordinates (Kolkata area) for new trips. */
export const DEFAULT_PICKUP = { lat: 22.5726, lng: 88.3639 };
export const DEFAULT_DESTINATION = { lat: 22.6102, lng: 88.4011 };

export function tripRoutePayload(
  overrides?: Partial<{
    pickupLatitude: number;
    pickupLongitude: number;
    destinationLatitude: number;
    destinationLongitude: number;
  }>,
) {
  return {
    pickupLatitude: DEFAULT_PICKUP.lat,
    pickupLongitude: DEFAULT_PICKUP.lng,
    destinationLatitude: DEFAULT_DESTINATION.lat,
    destinationLongitude: DEFAULT_DESTINATION.lng,
    ...overrides,
  };
}
