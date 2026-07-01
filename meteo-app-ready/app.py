"""Application météo personnalisée (Flask + API Open-Meteo, gratuite, sans clé)
+ modules complémentaires : qualité de l'air, citation du jour, crypto, transports (Navitia)."""
import datetime
from collections import defaultdict
from statistics import mean

import requests
from flask import Flask, jsonify, render_template, request

from config import NAVITIA_API_KEY

app = Flask(__name__)

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
QUOTE_URL = "https://zenquotes.io/api/today"
CRYPTO_URL = "https://api.coingecko.com/api/v3/simple/price"
NAVITIA_URL = "https://api.navitia.io/v1/coverage/sncf"

DAILY_VARS = ",".join([
    "weathercode",
    "temperature_2m_max",
    "temperature_2m_min",
    "wind_speed_10m_max",
    "wind_gusts_10m_max",
    "wind_direction_10m_dominant",
    "precipitation_sum",
    "precipitation_probability_max",
    "sunrise",
    "sunset",
])
# La pression et l'UV n'existent qu'au pas horaire chez Open-Meteo ; on les moyenne
# nous-mêmes par jour, et on garde le détail horaire complet pour l'affichage heure par heure.
HOURLY_VARS = ",".join([
    "temperature_2m",
    "weathercode",
    "precipitation_probability",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "uv_index",
    "pressure_msl",
])

WEATHER_CODES = {
    0: ("Ciel dégagé", "☀️"),
    1: ("Plutôt dégagé", "🌤️"),
    2: ("Partiellement nuageux", "⛅"),
    3: ("Couvert", "☁️"),
    45: ("Brouillard", "🌫️"),
    48: ("Brouillard givrant", "🌫️"),
    51: ("Bruine légère", "🌦️"),
    53: ("Bruine modérée", "🌦️"),
    55: ("Bruine dense", "🌧️"),
    56: ("Bruine verglaçante", "🌧️"),
    57: ("Bruine verglaçante dense", "🌧️"),
    61: ("Pluie légère", "🌧️"),
    63: ("Pluie modérée", "🌧️"),
    65: ("Pluie forte", "🌧️"),
    66: ("Pluie verglaçante", "🌧️"),
    67: ("Pluie verglaçante forte", "🌧️"),
    71: ("Neige légère", "🌨️"),
    73: ("Neige modérée", "🌨️"),
    75: ("Neige forte", "❄️"),
    77: ("Grains de neige", "❄️"),
    80: ("Averses légères", "🌦️"),
    81: ("Averses modérées", "🌧️"),
    82: ("Averses violentes", "⛈️"),
    85: ("Averses de neige légères", "🌨️"),
    86: ("Averses de neige fortes", "❄️"),
    95: ("Orage", "⛈️"),
    96: ("Orage avec grêle légère", "⛈️"),
    99: ("Orage avec grêle forte", "⛈️"),
}

ACTIVITIES = {
    "sport": "Sport / course à pied",
    "randonnee": "Randonnée",
    "velo": "Vélo",
    "plage": "Plage / baignade",
    "jardinage": "Jardinage",
    "aucune": "Aucune activité particulière",
}

CRYPTO_ASSETS = {
    "bitcoin": "Bitcoin",
    "ethereum": "Ethereum",
    "litecoin": "Litecoin",
    "dogecoin": "Dogecoin",
    "solana": "Solana",
    "cardano": "Cardano",
}

MOON_PHASE_NAMES = [
    "Nouvelle lune", "Premier croissant", "Premier quartier", "Lune gibbeuse croissante",
    "Pleine lune", "Lune gibbeuse décroissante", "Dernier quartier", "Dernier croissant",
]
MOON_PHASE_ICONS = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"]


def weather_label(code):
    return WEATHER_CODES.get(code, ("Conditions inconnues", "❓"))


def wind_compass(degrees):
    if degrees is None:
        return "?"
    directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    index = round(degrees / 22.5) % 16
    return directions[index]


def classify_aqi(value):
    """Classe l'indice européen de qualité de l'air (0-100+) en catégorie ATMO-like."""
    if value is None:
        return ("Indisponible", "❔")
    if value <= 20:
        return ("Bon", "🟢")
    if value <= 40:
        return ("Moyen", "🟡")
    if value <= 60:
        return ("Dégradé", "🟠")
    if value <= 80:
        return ("Mauvais", "🔴")
    if value <= 100:
        return ("Très mauvais", "🟣")
    return ("Extrêmement mauvais", "⚫")


def moon_phase(date):
    """Phase lunaire approximative (algorithme basé sur une nouvelle lune de référence)."""
    reference_new_moon = datetime.date(2001, 1, 1)
    days = (date - reference_new_moon).days
    lunations = 0.20439731 + days * 0.03386319269
    index = round((lunations % 1) * 8) % 8
    return MOON_PHASE_NAMES[index], MOON_PHASE_ICONS[index]


def geocode_city(city_name):
    resp = requests.get(
        GEOCODING_URL,
        params={"name": city_name, "count": 5, "language": "fr", "format": "json"},
        timeout=10,
    )
    resp.raise_for_status()
    results = resp.json().get("results")
    if not results:
        return None
    best = results[0]
    return {
        "lat": best["latitude"],
        "lon": best["longitude"],
        "name": best["name"],
        "country": best.get("country", ""),
        "admin1": best.get("admin1", ""),
    }


def fetch_forecast(lat, lon):
    resp = requests.get(
        FORECAST_URL,
        params={
            "latitude": lat,
            "longitude": lon,
            "daily": DAILY_VARS,
            "hourly": HOURLY_VARS,
            "timezone": "auto",
            "forecast_days": 7,
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def fetch_air_quality(lat, lon):
    resp = requests.get(
        AIR_QUALITY_URL,
        params={
            "latitude": lat,
            "longitude": lon,
            "hourly": "european_aqi",
            "timezone": "auto",
            "forecast_days": 7,
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def group_hourly_by_day(hourly, aqi_by_time):
    """Regroupe les données horaires Open-Meteo par jour (AAAA-MM-JJ)."""
    times = hourly.get("time", [])
    by_day = defaultdict(list)
    for i, t in enumerate(times):
        code = hourly["weathercode"][i]
        label, icon = weather_label(code)
        direction = hourly["wind_direction_10m"][i]
        aqi_value = aqi_by_time.get(t)
        aqi_label, aqi_icon = classify_aqi(aqi_value)
        by_day[t[:10]].append({
            "time": t[11:16],
            "label": label,
            "icon": icon,
            "temperature": hourly["temperature_2m"][i],
            "precipitation_probability": hourly["precipitation_probability"][i],
            "wind_speed": hourly["wind_speed_10m"][i],
            "wind_gusts": hourly["wind_gusts_10m"][i],
            "wind_direction": direction,
            "wind_compass": wind_compass(direction),
            "uv_index": hourly["uv_index"][i],
            "pressure": hourly["pressure_msl"][i],
            "aqi": aqi_value,
            "aqi_label": aqi_label,
            "aqi_icon": aqi_icon,
        })
    return by_day


def average_pressure_per_day(hourly_by_day):
    result = {}
    for day, hours in hourly_by_day.items():
        pressures = [h["pressure"] for h in hours if h["pressure"] is not None]
        if pressures:
            result[day] = round(mean(pressures), 1)
    return result


def average_daylight_uv_per_day(hourly_by_day):
    """UV moyen sur les heures de jour (UV > 0), plus représentatif que le simple maximum."""
    result = {}
    for day, hours in hourly_by_day.items():
        values = [h["uv_index"] for h in hours if h["uv_index"] not in (None, 0)]
        result[day] = round(mean(values), 1) if values else 0.0
    return result


def average_aqi_per_day(hourly_by_day):
    result = {}
    for day, hours in hourly_by_day.items():
        values = [h["aqi"] for h in hours if h["aqi"] is not None]
        result[day] = round(mean(values)) if values else None
    return result


def build_advice(activity, day):
    """Génère un résumé personnalisé selon l'activité et la météo du jour."""
    tips = []
    temp_max = day["temp_max"]
    temp_min = day["temp_min"]
    wind = day["wind_speed_max"]
    gusts = day["wind_gusts_max"]
    rain_proba = day["precipitation_probability_max"] or 0
    uv = day["uv_index_avg"] or 0
    aqi = day.get("air_quality", {}).get("aqi")

    if activity == "sport":
        if temp_max is not None and temp_max >= 28:
            tips.append("Forte chaleur : privilégie tôt le matin ou en soirée, et hydrate-toi bien.")
        if uv >= 5:
            tips.append("UV moyen élevé sur la journée : crème solaire et casquette recommandées.")
        if rain_proba >= 60:
            tips.append("Risque de pluie élevé : prévois une séance en intérieur ou un vêtement imperméable.")
        if wind is not None and wind >= 35:
            tips.append("Vent fort : attention si tu cours ou roules face au vent.")
        if aqi is not None and aqi > 60:
            tips.append("Qualité de l'air dégradée : réduis l'intensité de l'effort en extérieur.")
        if not tips:
            tips.append("Conditions favorables pour une séance de sport en extérieur.")

    elif activity == "randonnee":
        if gusts is not None and gusts >= 50:
            tips.append("Rafales fortes : sois prudent en crête ou en altitude.")
        if temp_min is not None and temp_min <= 5:
            tips.append("Matinée fraîche : prévois une couche chaude au départ.")
        if rain_proba >= 50:
            tips.append("Pluie probable : emporte une veste imperméable et vérifie l'état des sentiers.")
        if uv >= 5:
            tips.append("UV moyen élevé en altitude : protège ta peau et tes yeux.")
        if not tips:
            tips.append("Belle journée pour randonner, conditions stables.")

    elif activity == "velo":
        if wind is not None and wind >= 30:
            tips.append("Vent soutenu : anticipe une résistance à l'aller ou au retour.")
        if rain_proba >= 50:
            tips.append("Risque de pluie : chaussée glissante, adapte ta vitesse.")
        if temp_max is not None and temp_max >= 30:
            tips.append("Forte chaleur : emporte de l'eau en quantité.")
        if aqi is not None and aqi > 60:
            tips.append("Qualité de l'air dégradée : évite les grands axes routiers si possible.")
        if not tips:
            tips.append("Bonnes conditions pour rouler.")

    elif activity == "plage":
        if uv >= 5:
            tips.append("UV moyen élevé : crème solaire indice élevé et évite les heures les plus chaudes.")
        if wind is not None and wind >= 30:
            tips.append("Vent fort : attention aux parasols et à la baignade.")
        if rain_proba >= 50:
            tips.append("Risque de pluie : la journée plage n'est pas idéale.")
        if not tips:
            tips.append("Conditions agréables pour profiter de la plage.")

    elif activity == "jardinage":
        if rain_proba >= 60:
            tips.append("Pluie probable : reporte l'arrosage et les semis extérieurs.")
        if wind is not None and wind >= 40:
            tips.append("Vent fort : évite de tailler ou traiter les plantes fragiles.")
        if temp_max is not None and temp_max >= 30:
            tips.append("Forte chaleur : jardine plutôt tôt le matin ou en fin de journée.")
        if not tips:
            tips.append("Bonnes conditions pour jardiner.")

    else:
        tips.append("Aucune recommandation spécifique.")

    return tips


@app.route("/")
def index():
    return render_template("index.html", activities=ACTIVITIES, crypto_assets=CRYPTO_ASSETS)


@app.route("/api/weather")
def api_weather():
    city = request.args.get("city", "").strip()
    activity = request.args.get("activity", "aucune")

    if not city:
        return jsonify({"error": "Merci d'indiquer une ville."}), 400

    try:
        location = geocode_city(city)
    except requests.RequestException:
        return jsonify({"error": "Impossible de contacter le service de géocodage."}), 502

    if location is None:
        return jsonify({"error": f"Ville « {city} » introuvable."}), 404

    try:
        data = fetch_forecast(location["lat"], location["lon"])
    except requests.RequestException:
        return jsonify({"error": "Impossible de contacter le service météo."}), 502

    try:
        air_data = fetch_air_quality(location["lat"], location["lon"])
    except requests.RequestException:
        air_data = {"hourly": {}}

    daily = data.get("daily", {})
    aqi_by_time = dict(zip(
        air_data.get("hourly", {}).get("time", []),
        air_data.get("hourly", {}).get("european_aqi", []),
    ))
    hourly_by_day = group_hourly_by_day(data.get("hourly", {}), aqi_by_time)
    pressures = average_pressure_per_day(hourly_by_day)
    uv_averages = average_daylight_uv_per_day(hourly_by_day)
    aqi_averages = average_aqi_per_day(hourly_by_day)

    days = []
    for i, date in enumerate(daily.get("time", [])):
        code = daily["weathercode"][i]
        label, icon = weather_label(code)
        aqi_value = aqi_averages.get(date)
        aqi_label, aqi_icon = classify_aqi(aqi_value)
        moon_name, moon_icon = moon_phase(datetime.date.fromisoformat(date))

        day = {
            "date": date,
            "label": label,
            "icon": icon,
            "temp_max": daily["temperature_2m_max"][i],
            "temp_min": daily["temperature_2m_min"][i],
            "wind_speed_max": daily["wind_speed_10m_max"][i],
            "wind_gusts_max": daily["wind_gusts_10m_max"][i],
            "wind_direction": daily["wind_direction_10m_dominant"][i],
            "wind_compass": wind_compass(daily["wind_direction_10m_dominant"][i]),
            "precipitation_sum": daily["precipitation_sum"][i],
            "precipitation_probability_max": daily["precipitation_probability_max"][i],
            "pressure": pressures.get(date),
            "uv_index_avg": uv_averages.get(date, 0.0),
            "sunrise": daily["sunrise"][i][11:16],
            "sunset": daily["sunset"][i][11:16],
            "moon_phase": moon_name,
            "moon_icon": moon_icon,
            "air_quality": {"aqi": aqi_value, "label": aqi_label, "icon": aqi_icon},
            "hourly": hourly_by_day.get(date, []),
        }
        day["advice"] = build_advice(activity, day)
        days.append(day)

    return jsonify({
        "location": {
            "name": location["name"],
            "country": location["country"],
            "admin1": location["admin1"],
            "lat": location["lat"],
            "lon": location["lon"],
        },
        "activity": ACTIVITIES.get(activity, activity),
        "days": days,
    })


@app.route("/api/quote")
def api_quote():
    try:
        resp = requests.get(QUOTE_URL, timeout=10)
        resp.raise_for_status()
        item = resp.json()[0]
        return jsonify({"quote": item.get("q"), "author": item.get("a")})
    except (requests.RequestException, IndexError, ValueError):
        return jsonify({"error": "Impossible de récupérer la citation du jour."}), 502


@app.route("/api/crypto")
def api_crypto():
    symbol = request.args.get("symbol", "bitcoin")
    if symbol not in CRYPTO_ASSETS:
        return jsonify({"error": "Actif non supporté."}), 400

    try:
        resp = requests.get(
            CRYPTO_URL,
            params={"ids": symbol, "vs_currencies": "eur", "include_24hr_change": "true"},
            timeout=10,
        )
        resp.raise_for_status()
        info = resp.json().get(symbol)
    except requests.RequestException:
        return jsonify({"error": "Impossible de contacter CoinGecko."}), 502

    if not info:
        return jsonify({"error": "Donnée indisponible pour cet actif."}), 502

    return jsonify({
        "name": CRYPTO_ASSETS[symbol],
        "symbol": symbol,
        "price_eur": info.get("eur"),
        "change_24h": round(info.get("eur_24h_change", 0), 2),
    })


def navitia_get(path, params=None):
    resp = requests.get(
        f"{NAVITIA_URL}{path}",
        params=params or {},
        auth=(NAVITIA_API_KEY, ""),
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


@app.route("/api/transit")
def api_transit():
    try:
        lat = float(request.args.get("lat"))
        lon = float(request.args.get("lon"))
    except (TypeError, ValueError):
        return jsonify({"error": "Coordonnées manquantes ou invalides."}), 400

    try:
        nearby = navitia_get(
            f"/coords/{lon};{lat}/places_nearby",
            {"type[]": "stop_area", "distance": 3000, "count": 4},
        )
    except requests.RequestException:
        return jsonify({"error": "Impossible de contacter le service de transport (Navitia)."}), 502

    stops = []
    for place in nearby.get("places_nearby", []):
        try:
            deps = navitia_get(f"/stop_areas/{place['id']}/departures", {"count": 4})
        except requests.RequestException:
            deps = {}

        departures = []
        for d in deps.get("departures", []):
            info = d.get("display_informations", {})
            dt = d.get("stop_date_time", {}).get("departure_date_time", "")
            time_label = f"{dt[9:11]}:{dt[11:13]}" if len(dt) >= 13 else "?"
            departures.append({
                "line": info.get("label"),
                "direction": info.get("direction"),
                "time": time_label,
            })

        stops.append({
            "name": place.get("name"),
            "distance": place.get("distance"),
            "departures": departures,
        })

    return jsonify({"stops": stops})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
