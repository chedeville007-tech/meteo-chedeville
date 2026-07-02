"""Import de matchs depuis api-sports.io (souscription directe, 1 seule clé pour
football/rugby/basketball). Header d'auth commun : x-apisports-key.

Tennis et ping-pong ne sont couverts par aucune offre api-sports.io -> saisie manuelle.
"""

import os
from datetime import datetime

import requests

API_KEY_ENV = "API_SPORTS_KEY"


class SportsApiError(Exception):
    pass


def _get_api_key() -> str:
    api_key = os.environ.get(API_KEY_ENV)
    if not api_key:
        raise SportsApiError(
            f"{API_KEY_ENV} n'est pas configurée. Crée un compte gratuit sur "
            "https://dashboard.api-football.com/register, abonne-toi (gratuit) aux sports voulus, "
            "et ajoute la clé dans les variables d'environnement pour activer l'import automatique."
        )
    return api_key


def _call(host: str, endpoint: str, params: dict) -> list[dict]:
    api_key = _get_api_key()
    try:
        response = requests.get(
            f"https://{host}{endpoint}",
            params=params,
            headers={"x-apisports-key": api_key},
            timeout=15,
        )
    except requests.RequestException as exc:
        raise SportsApiError(f"Impossible de contacter l'API ({host}) : {exc}") from exc

    if response.status_code == 429:
        raise SportsApiError("Quota api-sports.io dépassé pour aujourd'hui (plan gratuit : 100 requêtes/jour/sport).")
    if response.status_code != 200:
        raise SportsApiError(f"L'API ({host}) a répondu avec une erreur ({response.status_code}).")

    payload = response.json()
    if payload.get("errors"):
        raise SportsApiError(f"Erreur API ({host}) : {payload['errors']}")
    return payload.get("response", [])


def _fetch_football(league_id: int, season: int, count: int) -> list[dict]:
    items = _call(
        "v3.football.api-sports.io",
        "/fixtures",
        {"league": league_id, "season": season, "next": count},
    )
    fixtures = []
    for item in items:
        fixture = item.get("fixture", {})
        teams = item.get("teams", {})
        timestamp = fixture.get("timestamp")
        if timestamp is None:
            continue
        fixtures.append(
            {
                "external_id": f"apisports-football:{fixture.get('id')}",
                "home_name": teams.get("home", {}).get("name", "?"),
                "away_name": teams.get("away", {}).get("name", "?"),
                "start_time": datetime.fromtimestamp(timestamp),
            }
        )
    return fixtures


def _fetch_games(sport_key: str, host: str, league_id: int, season: int, count: int) -> list[dict]:
    """Rugby/basketball : pas de parametre 'next' documente -> on recupere la saison
    et on filtre nous-memes aux matchs a venir."""
    items = _call(host, "/games", {"league": league_id, "season": season})
    now = datetime.now()
    fixtures = []
    for item in items:
        timestamp = item.get("timestamp")
        if timestamp is None:
            continue
        start_time = datetime.fromtimestamp(timestamp)
        if start_time < now:
            continue
        teams = item.get("teams", {})
        fixtures.append(
            {
                "external_id": f"apisports-{sport_key.lower()}:{item.get('id')}",
                "home_name": teams.get("home", {}).get("name", "?"),
                "away_name": teams.get("away", {}).get("name", "?"),
                "start_time": start_time,
            }
        )
    fixtures.sort(key=lambda f: f["start_time"])
    return fixtures[:count]


# Compétitions courantes -> id api-sports.io. Pour rugby/basket, vérifie/complète les
# ids via https://dashboard.api-sports.io (section "Leagues" du sport concerné).
IMPORTABLE_SPORTS = {
    "FOOTBALL": {
        "label": "Football",
        "fetch": _fetch_football,
        "leagues": [
            {"id": 61, "label": "Ligue 1 (France)"},
            {"id": 39, "label": "Premier League (Angleterre)"},
            {"id": 140, "label": "La Liga (Espagne)"},
            {"id": 135, "label": "Serie A (Italie)"},
            {"id": 78, "label": "Bundesliga (Allemagne)"},
            {"id": 2, "label": "Ligue des champions (UEFA)"},
            {"id": 3, "label": "Ligue Europa (UEFA)"},
        ],
    },
    "RUGBY": {
        "label": "Rugby",
        "fetch": lambda league_id, season, count: _fetch_games("RUGBY", "v1.rugby.api-sports.io", league_id, season, count),
        "leagues": [
            {"id": 16, "label": "Top 14 (France)"},
            {"id": 4, "label": "Six Nations"},
        ],
    },
    "BASKETBALL": {
        "label": "Basketball",
        "fetch": lambda league_id, season, count: _fetch_games("BASKETBALL", "v1.basketball.api-sports.io", league_id, season, count),
        "leagues": [
            {"id": 12, "label": "NBA"},
            {"id": 120, "label": "LNB Pro A (France)"},
        ],
    },
}


def fetch_upcoming_fixtures(sport_key: str, league_id: int, season: int, count: int = 15) -> list[dict]:
    sport = IMPORTABLE_SPORTS.get(sport_key)
    if sport is None:
        raise SportsApiError("Sport non pris en charge par l'import automatique.")
    return sport["fetch"](league_id, season, count)
