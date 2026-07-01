"""Clés d'API personnelles. Ne jamais versionner de vraies clés ici : elles sont lues
depuis les variables d'environnement, chargées localement via un fichier .env
(non versionné, voir .gitignore) et configurées sur Render pour la production."""
import os

from dotenv import load_dotenv

load_dotenv()

# Clé Navitia (SNCF) pour les horaires de transport en commun.
# Obtenue gratuitement sur https://navitia.io — clé personnelle, à garder secrète.
NAVITIA_API_KEY = os.environ.get("NAVITIA_API_KEY", "")

# Supabase (authentification + base de données pour comptes utilisateurs).
# L'URL et la clé "anon"/"publishable" sont publiques par conception (protégées par
# Row Level Security) : pas de risque à les exposer côté frontend ou dans le dépôt.
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://uwmagtlatdnplgnwgrpo.supabase.co")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "sb_publishable_nc-T6IRwH-IDX7nBgrsfhA_0rDaaSgT")
