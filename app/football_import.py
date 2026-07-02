"""Import de matchs de football depuis football-data.org (vrai plan gratuit,
saison en cours, inclut Coupe du Monde et Euro). Header d'auth : X-Auth-Token.

Rugby/basketball/tennis/ping-pong ne sont couverts par aucune offre gratuite
fiable trouvée à ce jour -> saisie manuelle pour ces sports.
"""

import os
from datetime import datetime, timedelta

import requests

API_KEY_ENV = "FOOTBALL_DATA_API_KEY"
BASE_URL = "https://api.football-data.org/v4"

# Compétitions couvertes par le plan gratuit de football-data.org
COMPETITIONS = [
    {"id": "WC", "label": "Coupe du Monde"},
    {"id": "EC", "label": "Euro (Championnat d'Europe)"},
    {"id": "CL", "label": "Ligue des champions (UEFA)"},
    {"id": "FL1", "label": "Ligue 1 (France)"},
    {"id": "PL", "label": "Premier League (Angleterre)"},
    {"id": "PD", "label": "La Liga (Espagne)"},
    {"id": "SA", "label": "Serie A (Italie)"},
    {"id": "BL1", "label": "Bundesliga (Allemagne)"},
    {"id": "DED", "label": "Eredivisie (Pays-Bas)"},
    {"id": "PPL", "label": "Primeira Liga (Portugal)"},
    {"id": "ELC", "label": "Championship (Angleterre, 2e div.)"},
    {"id": "BSA", "label": "Serie A (Brésil)"},
]


class FootballImportError(Exception):
    pass


def fetch_upcoming_matches(competition_id: str, days_ahead: int = 30, count: int = 15) -> list[dict]:
    api_key = os.environ.get(API_KEY_ENV)
    if not api_key:
        raise FootballImportError(
            f"{API_KEY_ENV} n'est pas configurée. Crée un compte gratuit sur "
            "https://www.football-data.org/client/register et ajoute ton jeton "
            "dans les variables d'environnement pour activer l'import automatique."
        )

    today = datetime.now().date()
    try:
        response = requests.get(
            f"{BASE_URL}/competitions/{competition_id}/matches",
            params={
                "status": "SCHEDULED",
                "dateFrom": today.isoformat(),
                "dateTo": (today + timedelta(days=days_ahead)).isoformat(),
            },
            headers={"X-Auth-Token": api_key},
            timeout=15,
        )
    except requests.RequestException as exc:
        raise FootballImportError(f"Impossible de contacter football-data.org : {exc}") from exc

    if response.status_code == 429:
        raise FootballImportError("Quota football-data.org dépassé (plan gratuit : 10 requêtes/minute).")
    if response.status_code == 403:
        raise FootballImportError("Cette compétition n'est pas incluse dans le plan gratuit de ton compte.")
    if response.status_code != 200:
        raise FootballImportError(f"football-data.org a répondu avec une erreur ({response.status_code}).")

    payload = response.json()
    matches = []
    for item in payload.get("matches", [])[:count]:
        utc_date = item.get("utcDate")
        if not utc_date:
            continue
        matches.append(
            {
                "external_id": f"football-data:{item.get('id')}",
                "home_name": item.get("homeTeam", {}).get("name", "?"),
                "away_name": item.get("awayTeam", {}).get("name", "?"),
                "start_time": datetime.fromisoformat(utc_date.replace("Z", "+00:00")),
            }
        )
    return matches
