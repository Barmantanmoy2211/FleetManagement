export type LocationDetailTabId =
  | "details"
  | "employees"
  | "drivers"
  | "fleet-managers"
  | "location-head";

export const LOCATION_DETAIL_TABS: { id: LocationDetailTabId; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "employees", label: "Employees" },
  { id: "drivers", label: "Drivers" },
  { id: "fleet-managers", label: "Fleet managers" },
  { id: "location-head", label: "Location head" },
];

export function locationDetailTabLabel(id: LocationDetailTabId): string {
  return LOCATION_DETAIL_TABS.find((t) => t.id === id)?.label ?? id;
}
