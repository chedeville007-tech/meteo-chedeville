"""Application météo personnalisée (Flask + API Open-Meteo, gratuite, sans clé)."""
from collections import defaultdict
from statistics import mean

import requests
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

DAILY_VARS = ",".join([
    "weathercode",
    "temperature_2m_max",
    "temperature_2m_min",
    "uv_index_max",
    "wind_speed_10m_max",
    "wind_gusts_10m_max",
    "wind_direction_10m_dominant",
    "precipitation_sum",
    "precipitation_probability_max",
])
# La pression n'existe qu'au pas horaire chez Open-Meteo ; on la moyenne nous-mêmes par jour,
# et on garde le détail horaire complet pour l'affichage heure par heure.
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


def weather_label(code):
    return WEATHER_CODES.get(code, ("Conditions inconnues", "❓"))


def wind_compass(degrees):
    if degrees is None:
        return "?"
    directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    index = round(degrees / 22.5) % 16
    return directions[index]


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


def group_hourly_by_day(hourly):
    """Regroupe les données horaires Open-Meteo par jour (AAAA-MM-JJ)."""
    times = hourly.get("time", [])
    by_day = defaultdict(list)
    for i, t in enumerate(times):
        code = hourly["weathercode"][i]
        label, icon = weather_label(code)
        direction = hourly["wind_direction_10m"][i]
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
        })
    return by_day


def average_pressure_per_day(hourly_by_day):
    result = {}
    for day, hours in hourly_by_day.items():
        pressures = [h["pressure"] for h in hours if h["pressure"] is not None]
        if pressures:
            result[day] = round(mean(pressures), 1)
    return result


def build_advice(activity, day):
    """Génère un résumé personnalisé selon l'activité et la météo du jour."""
    tips = []
    temp_max = day["temp_max"]
    temp_min = day["temp_min"]
    wind = day["wind_speed_max"]
    gusts = day["wind_gusts_max"]
    rain_proba = day["precipitation_probability_max"] or 0
    uv = day["uv_index_max"] or 0

    if activity == "sport":
        if temp_max is not None and temp_max >= 28:
            tips.append("Forte chaleur : privilégie tôt le matin ou en soirée, et hydrate-toi bien.")
        if uv >= 6:
            tips.append("UV élevé : crème solaire et casquette recommandées.")
        if rain_proba >= 60:
            tips.append("Risque de pluie élevé : prévois une séance en intérieur ou un vêtement imperméable.")
        if wind is not None and wind >= 35:
            tips.append("Vent fort : attention si tu cours ou roules face au vent.")
        if not tips:
            tips.append("Conditions favorables pour une séance de sport en extérieur.")

    elif activity == "randonnee":
        if gusts is not None and gusts >= 50:
            tips.append("Rafales fortes : sois prudent en crête ou en altitude.")
        if temp_min is not None and temp_min <= 5:
            tips.append("Matinée fraîche : prévois une couche chaude au départ.")
        if rain_proba >= 50:
            tips.append("Pluie probable : emporte une veste imperméable et vérifie l'état des sentiers.")
        if uv >= 6:
            tips.append("UV élevé en altitude : protège ta peau et tes yeux.")
        if not tips:
            tips.append("Belle journée pour randonner, conditions stables.")

    elif activity == "velo":
        if wind is not None and wind >= 30:
            tips.append("Vent soutenu : anticipe une résistance à l'aller ou au retour.")
        if rain_proba >= 50:
            tips.append("Risque de pluie : chaussée glissante, adapte ta vitesse.")
        if temp_max is not None and temp_max >= 30:
            tips.append("Forte chaleur : emporte de l'eau en quantité.")
        if not tips:
            tips.append("Bonnes conditions pour rouler.")

    elif activity == "plage":
        if uv >= 6:
            tips.append("UV élevé : crème solaire indice élevé et évite les heures les plus chaudes.")
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
    return render_template("index.html", activities=ACTIVITIES)


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

    daily = data.get("daily", {})
    hourly_by_day = group_hourly_by_day(data.get("hourly", {}))
    pressures = average_pressure_per_day(hourly_by_day)

    days = []
    for i, date in enumerate(daily.get("time", [])):
        code = daily["weathercode"][i]
        label, icon = weather_label(code)
        day = {
            "date": date,
            "label": label,
            "icon": icon,
            "temp_max": daily["temperature_2m_max"][i],
            "temp_min": daily["temperature_2m_min"][i],
            "uv_index_max": daily["uv_index_max"][i],
            "wind_speed_max": daily["wind_speed_10m_max"][i],
            "wind_gusts_max": daily["wind_gusts_10m_max"][i],
            "wind_direction": daily["wind_direction_10m_dominant"][i],
            "wind_compass": wind_compass(daily["wind_direction_10m_dominant"][i]),
            "precipitation_sum": daily["precipitation_sum"][i],
            "precipitation_probability_max": daily["precipitation_probability_max"][i],
            "pressure": pressures.get(date),
            "hourly": hourly_by_day.get(date, []),
        }
        day["advice"] = build_advice(activity, day)
        days.append(day)

    return jsonify({
        "location": {
            "name": location["name"],
            "country": location["country"],
            "admin1": location["admin1"],
        },
        "activity": ACTIVITIES.get(activity, activity),
        "days": days,
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)
