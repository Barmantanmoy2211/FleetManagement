from __future__ import annotations

from datetime import datetime, timezone

from app.models import TripStatus


def parse_iso(value: str) -> datetime:
    text = value.strip()
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def trip_blocking_window(trip: dict) -> tuple[datetime, datetime] | None:
    status = trip.get("status")
    if status in (TripStatus.COMPLETED.value, TripStatus.CANCELLED.value):
        return None
    if status == TripStatus.IN_PROGRESS.value:
        raw_start = trip.get("actualStartTime") or trip.get("startTime")
        start = parse_iso(raw_start)
        end_raw = trip.get("endTime")
        if end_raw:
            end = parse_iso(end_raw)
        elif trip.get("scheduledEndTime"):
            end = parse_iso(trip["scheduledEndTime"])
        else:
            end = datetime.max.replace(tzinfo=timezone.utc)
        return start, end
    if status == TripStatus.SCHEDULED.value:
        return (
            parse_iso(trip["scheduledStartTime"]),
            parse_iso(trip["scheduledEndTime"]),
        )
    return None


def windows_overlap(
    a: tuple[datetime, datetime], b: tuple[datetime, datetime]
) -> bool:
    a_start, a_end = a
    b_start, b_end = b
    return a_start < b_end and b_start < a_end
