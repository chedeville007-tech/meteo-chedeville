# MultiProno

Pool de pronostics sportifs multi-sports (foot, rugby, tennis, ping-pong, basket...)
à jouer entre amis, en entreprise ou en groupe de fans.

Authentification par compte (e-mail + mot de passe + pseudo unique, `/inscription` et `/connexion`) —
un même compte est utilisé dans tous les groupes rejoints.

Stack : **Python + Flask + PostgreSQL (Supabase) + Jinja2 + Tailwind CSS** (aucune dépendance Node.js).

## Installation

```powershell
py -m pip install -r requirements.txt
copy .env.example .env
```

Édite `.env` et renseigne `DATABASE_URL` (Supabase → bouton **Connect** → onglet **Direct** →
**Session pooler**) et un `SECRET_KEY` aléatoire.

Si les tables n'existent pas encore côté Supabase, exécute d'abord `supabase_schema.sql`
(Dashboard → SQL Editor → New query → Run).

## Lancer l'application

```powershell
py run.py
```

Puis ouvrir http://127.0.0.1:5000

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

## Base de données (Supabase / PostgreSQL)

L'app se connecte directement à Postgres via `psycopg2` (variable d'environnement `DATABASE_URL`,
connexion "Session pooler" recommandée — compatible IPv4, contrairement à la connexion "Direct").
`supabase_schema.sql` contient le schéma complet (tables + RLS verrouillée) à exécuter une fois
dans Supabase. Pas de RLS `auth.uid()` : cette app n'utilise pas Supabase Auth (pseudo + code de
groupe gérés côté serveur), donc `DATABASE_URL` doit utiliser l'utilisateur `postgres` qui bypass
RLS — ne jamais utiliser la clé `anon` avec ces tables.

### Déploiement sur Render

Dans le dashboard Render → Settings → Environment, ajoute :
- `DATABASE_URL` : la connection string Supabase (Session pooler)
- `SECRET_KEY` : une valeur aléatoire (généré automatiquement si déployé via `render.yaml` en Blueprint)

Tous les matchs (tous sports) sont ajoutés à la main par l'admin du groupe — pas d'import
automatique (aucune API gratuite avec accès à la saison en cours n'a été jugée satisfaisante).

## Structure

- `app/db.py` — connexion PostgreSQL (`psycopg2`), `supabase_schema.sql` — schéma (users, groups, members, sports, matches, predictions)
- `app/auth.py` — comptes email + mot de passe (werkzeug), sessions Flask ; un `User` peut appartenir à plusieurs `Group` via `Member`
- `app/scoring.py` — calcul des points (10 pts vainqueur, +50% si score exact, x2 si bonus activé sur le match)
- `app/routes/` — routes Flask (accueil, groupes, matchs, pronostics)
- `app/templates/` — templates Jinja2 (`group/` = pages d'un groupe avec onglets)

## Notes

- Le CDN Google Fonts (Teko, Manrope) et Alpine.js (interactions légères : onglets, copier-coller)
  sont chargés via `<script>`/`<link>` CDN — nécessitent une connexion internet.
