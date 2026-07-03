SEED_SPORTS = [
    {"key": "FOOTBALL", "label": "Football", "allow_draw": True, "color": "#35d493", "sort_order": 1},
    {"key": "RUGBY", "label": "Rugby", "allow_draw": False, "color": "#e2703a", "sort_order": 2},
    {"key": "TENNIS", "label": "Tennis", "allow_draw": False, "color": "#d8db4a", "sort_order": 3},
    {"key": "PING_PONG", "label": "Ping-pong", "allow_draw": False, "color": "#4fa8ff", "sort_order": 4},
    {"key": "BASKETBALL", "label": "Basketball", "allow_draw": False, "color": "#ff9a3d", "sort_order": 5},
    {"key": "MMA", "label": "MMA", "allow_draw": False, "color": "#c9425a", "sort_order": 6},
    {"key": "HANDBALL", "label": "Handball", "allow_draw": True, "color": "#f2b705", "sort_order": 7},
    {"key": "VOLLEYBALL", "label": "Volleyball", "allow_draw": False, "color": "#3ec9c0", "sort_order": 8},
    {"key": "ICE_HOCKEY", "label": "Hockey sur glace", "allow_draw": False, "color": "#7ea6ff", "sort_order": 9},
    {"key": "BOXING", "label": "Boxe", "allow_draw": False, "color": "#d94f4f", "sort_order": 10},
]

# Sports gérés par une icône dédiée dans templates/partials/icons.html ;
# toute nouvelle clé retombe sur l'icône générique "trophy".
KNOWN_SPORT_ICONS = {
    "FOOTBALL", "RUGBY", "TENNIS", "PING_PONG", "BASKETBALL",
    "MMA", "HANDBALL", "VOLLEYBALL", "ICE_HOCKEY", "BOXING",
}


def icon_name_for(sport_key: str) -> str:
    return sport_key if sport_key in KNOWN_SPORT_ICONS else "TROPHY"
