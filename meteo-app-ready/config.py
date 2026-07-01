"""Clés d'API personnelles. Ne pas versionner de vraies clés ici : elles sont lues
depuis les variables d'environnement (voir README pour la configuration sur Render)."""
import os

# Clé Navitia (SNCF) pour les horaires de transport en commun.
# Obtenue gratuitement sur https://navitia.io
NAVITIA_API_KEY = os.environ.get("NAVITIA_API_KEY", "")
