"""Import de matchs de football depuis API-Football (RapidAPI, plan gratuit)."""

import os
from datetime import datetime

import requests

API_HOST = "v3.football.api-sports.io"
API_URL = f"https://{API_HOST}/fixtures"

# Compétitions courantes -> id API-Football (https://www.api-football.com)
LEAGUES = [
    {"id": 61, "label": "Ligue 1 (France)"},
    {"id": 39, "label": "Premier League (Angleterre)"},
    {"id": 140, "label": "La Liga (Espagne)"},
    {"id": 135, "label": "Serie A (Italie)"},
    {"id": 78, "label": "Bundesliga (Allemagne)"},
    {"id": 2, "label": "Ligue des champions (UEFA)"},
    {"id": 3, "label": "Ligue Europa (UEFA)"},
]


class FootballApiError(Exception):
    pass


def fetch_upcoming_fixtures(league_id: int, season: int, count: int = 15) -> list[dict]:
    api_key = os.environ.get("FOOTBALL_API_KEY")
    if not api_key:
        raise FootballApiError(
            "FOOTBALL_API_KEY n'est pas configurée. Ajoute une clé RapidAPI (API-Football) "
            "dans les variables d'environnement pour activer l'import automatique."
        )

    try:
        response = requests.get(
            API_URL,
            params={"league": league_id, "season": season, "next": count},
            headers={"x-rapidapi-host": API_HOST, "x-rapidapi-key": api_key},
            timeout=15,
        )
    except requests.RequestException as exc:
        raise FootballApiError(f"Impossible de contacter l'API football : {exc}") from exc

    if response.status_code == 429:
        raise FootballApiError("Quota API-Football dépassé pour aujourd'hui (plan gratuit : 100 requêtes/jour).")
    if response.status_code != 200:
        raise FootballApiError(f"L'API football a répondu avec une erreur ({response.status_code}).")

    payload = response.json()
    if payload.get("errors"):
        raise FootballApiError(f"Erreur API-Football : {payload['errors']}")

    fixtures = []
    for item in payload.get("response", []):
        fixture = item.get("fixture", {})
        teams = item.get("teams", {})
        timestamp = fixture.get("timestamp")
        if timestamp is None:
            continue
        fixtures.append(
            {
                "external_id": f"api-football:{fixture.get('id')}",
                "home_name": teams.get("home", {}).get("name", "?"),
                "away_name": teams.get("away", {}).get("name", "?"),
                "start_time": datetime.fromtimestamp(timestamp),
            }
        )
    return fixtures
