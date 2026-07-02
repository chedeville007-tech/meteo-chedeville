from datetime import datetime

_WEEKDAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."]
_MONTHS = [
    "janv.", "févr.", "mars", "avr.", "mai", "juin",
    "juil.", "août", "sept.", "oct.", "nov.", "déc.",
]


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value)


def format_datetime_fr(value) -> str:
    dt = parse_iso(value) if isinstance(value, str) else value
    weekday = _WEEKDAYS[dt.weekday()]
    month = _MONTHS[dt.month - 1]
    return f"{weekday} {dt.day:02d} {month} {dt.hour:02d}:{dt.minute:02d}"
