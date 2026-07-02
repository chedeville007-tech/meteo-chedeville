SEED_SPORTS = [
    {"key": "FOOTBALL", "label": "Football", "allow_draw": True, "color": "#35d493", "sort_order": 1},
    {"key": "RUGBY", "label": "Rugby", "allow_draw": False, "color": "#e2703a", "sort_order": 2},
    {"key": "TENNIS", "label": "Tennis", "allow_draw": False, "color": "#d8db4a", "sort_order": 3},
    {"key": "PING_PONG", "label": "Ping-pong", "allow_draw": False, "color": "#4fa8ff", "sort_order": 4},
    {"key": "BASKETBALL", "label": "Basketball", "allow_draw": False, "color": "#ff9a3d", "sort_order": 5},
]

# Sports gérés par une icône dédiée dans templates/partials/icons.html ;
# toute nouvelle clé retombe sur l'icône générique "trophy".
KNOWN_SPORT_ICONS = {"FOOTBALL", "RUGBY", "TENNIS", "PING_PONG", "BASKETBALL"}


def icon_name_for(sport_key: str) -> str:
    return sport_key if sport_key in KNOWN_SPORT_ICONS else "TROPHY"
