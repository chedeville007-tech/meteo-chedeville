# MultiProno

Pool de pronostics sportifs multi-sports (foot, rugby, tennis, ping-pong, basket...)
à jouer entre amis, en entreprise ou en groupe de fans.

Stack : **Python + Flask + SQLite + Jinja2 + Tailwind CSS** (aucune dépendance Node.js).

## Installation

```powershell
py -m pip install -r requirements.txt
```

## Lancer l'application

```powershell
py run.py
```

Puis ouvrir http://127.0.0.1:5000

La base SQLite est créée automatiquement au premier lancement dans `instance/multiprono.sqlite3`,
avec les 5 sports pré-remplis (Football, Rugby, Tennis, Ping-pong, Basketball).

## Modifier le design (Tailwind)

Les classes Tailwind sont compilées à l'avance dans `app/static/css/app.css` (pas de build au runtime,
pas de Node.js). Le thème (couleurs, polices) se configure dans `app/static/src/input.css`.

Si tu modifies des classes Tailwind dans les templates ou le thème, recompile avec le binaire
standalone (pas de Node.js requis) — à télécharger une fois depuis les releases GitHub officielles :

```powershell
# Windows
Invoke-WebRequest -Uri "https://github.com/tailwindlabs/tailwindcss/releases/latest/download/tailwindcss-windows-x64.exe" -OutFile tools\tailwindcss.exe
tools\tailwindcss.exe -i app\static\src\input.css -o app\static\css\app.css --minify
```

```bash
# Linux / macOS
curl -sLO https://github.com/tailwindlabs/tailwindcss/releases/latest/download/tailwindcss-linux-x64
chmod +x tailwindcss-linux-x64
./tailwindcss-linux-x64 -i app/static/src/input.css -o app/static/css/app.css --minify
```

Le binaire n'est pas versionné dans le repo (~100 Mo) ; `app/static/css/app.css` déjà compilé
est bien commité et suffit pour faire tourner l'app sans rien recompiler.

## Base de données en production (Supabase)

Par défaut l'app utilise SQLite (`instance/multiprono.sqlite3`), non persistant sur un hébergeur
comme Render (disque éphémère). `supabase_schema.sql` contient le schéma équivalent en PostgreSQL
à exécuter dans Supabase (Dashboard → SQL Editor) pour une persistance durable. Le code Flask
(`app/db.py`) utilise encore SQLite pour l'instant — le brancher sur Postgres/Supabase est une
étape à part (connexion via `psycopg2`/`SQLAlchemy` + clé `service_role`, pas la clé `anon`).

## Structure

- `app/db.py`, `app/schema.sql` — accès SQLite et schéma (users, groups, members, sports, matches, predictions)
- `app/auth.py` — identification par cookie d'appareil (pas d'OAuth), un `User` peut appartenir à plusieurs `Group` via `Member`
- `app/scoring.py` — calcul des points (10 pts vainqueur, +50% si score exact, x2 si bonus activé sur le match)
- `app/routes/` — routes Flask (accueil, groupes, matchs, pronostics)
- `app/templates/` — templates Jinja2 (`group/` = pages d'un groupe avec onglets)

## Notes

- Le CDN Google Fonts (Teko, Manrope) et Alpine.js (interactions légères : onglets, copier-coller)
  sont chargés via `<script>`/`<link>` CDN — nécessitent une connexion internet.
