-- ========================================================================
-- MultiProno — À exécuter dans Supabase : Dashboard -> SQL Editor -> New query -> Run
-- Idempotent : rejouable sans risque après une mise à jour.
--
-- Important : cette app n'utilise PAS Supabase Auth (pas de compte via
-- auth.users) — comptes email + mot de passe geres a la main cote serveur
-- Flask (werkzeug password hashing). Le backend doit se connecter avec la
-- cle service_role (ou la connection string Postgres directe), qui bypass
-- RLS. Ne jamais utiliser la cle anon/public avec ces tables.
-- ========================================================================

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  password_hash text,
  pseudo text,
  created_at timestamptz not null default now()
);
alter table users add column if not exists email text unique;
alter table users add column if not exists password_hash text;
alter table users add column if not exists pseudo text;

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  pseudo text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  user_id uuid not null references users(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  unique (group_id, pseudo),
  unique (group_id, user_id)
);

create table if not exists sports (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  allow_draw boolean not null default true,
  color text not null,
  sort_order integer not null default 0
);

create table if not exists competitions (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references sports(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  unique (sport_id, name)
);

-- Calendrier officiel pre-rempli a la main (recherche web), pour le menu
-- "Ajout officiel rapide" -- pas d'API temps reel, donnees a completer au fil de l'eau.
create table if not exists official_fixtures (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  home_name text not null,
  away_name text not null,
  start_time timestamptz not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_official_fixtures_competition on official_fixtures(competition_id);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  sport_id uuid not null references sports(id),
  competition_id uuid references competitions(id),
  home_name text not null,
  away_name text not null,
  start_time timestamptz not null,
  status text not null default 'UPCOMING' check (status in ('UPCOMING', 'LIVE', 'FINISHED')),
  home_score integer,
  away_score integer,
  double_bonus boolean not null default false,
  created_at timestamptz not null default now(),
  -- identifiant du fixture cote fournisseur (import automatique, non utilise actuellement)
  external_id text unique
);
alter table matches add column if not exists external_id text unique;
alter table matches add column if not exists competition_id uuid references competitions(id);

create table if not exists predictions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  predicted_outcome text not null check (predicted_outcome in ('HOME', 'AWAY', 'DRAW')),
  predicted_home_score integer,
  predicted_away_score integer,
  -- bonus x2 choisi par le membre lui-meme (pas l'admin), limite a 2 par competition
  bonus_activated boolean not null default false,
  points integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, member_id)
);
alter table predictions add column if not exists bonus_activated boolean not null default false;

create index if not exists idx_members_group on members(group_id);
create index if not exists idx_matches_group on matches(group_id);
create index if not exists idx_competitions_sport on competitions(sport_id);
create index if not exists idx_predictions_match on predictions(match_id);
create index if not exists idx_predictions_member on predictions(member_id);

-- ========================================================================
-- Sports pré-remplis (idempotent : relancer met juste à jour les valeurs)
-- ========================================================================
insert into sports (key, label, allow_draw, color, sort_order) values
  ('FOOTBALL', 'Football', true, '#35d493', 1),
  ('RUGBY', 'Rugby', false, '#e2703a', 2),
  ('TENNIS', 'Tennis', false, '#d8db4a', 3),
  ('PING_PONG', 'Ping-pong', false, '#4fa8ff', 4),
  ('BASKETBALL', 'Basketball', false, '#ff9a3d', 5),
  ('MMA', 'MMA', false, '#c9425a', 6),
  ('HANDBALL', 'Handball', true, '#f2b705', 7),
  ('VOLLEYBALL', 'Volleyball', false, '#3ec9c0', 8),
  ('ICE_HOCKEY', 'Hockey sur glace', false, '#7ea6ff', 9),
  ('BOXING', 'Boxe', false, '#d94f4f', 10)
on conflict (key) do update set
  label = excluded.label,
  allow_draw = excluded.allow_draw,
  color = excluded.color,
  sort_order = excluded.sort_order;

-- ========================================================================
-- Compétitions pré-remplies par sport (idempotent)
-- ========================================================================
insert into competitions (sport_id, name, sort_order)
select s.id, c.name, c.sort_order
from (values
  ('FOOTBALL', 'Ligue 1', 0), ('FOOTBALL', 'Premier League', 1), ('FOOTBALL', 'La Liga', 2),
  ('FOOTBALL', 'Serie A', 3), ('FOOTBALL', 'Bundesliga', 4), ('FOOTBALL', 'Ligue des champions', 5),
  ('FOOTBALL', 'Ligue Europa', 6), ('FOOTBALL', 'Coupe du Monde', 7), ('FOOTBALL', 'Euro', 8),
  ('RUGBY', 'Top 14', 0), ('RUGBY', 'Pro D2', 1), ('RUGBY', 'Six Nations', 2),
  ('RUGBY', 'Coupe du Monde de Rugby', 3), ('RUGBY', 'Champions Cup', 4),
  ('TENNIS', 'Roland-Garros', 0), ('TENNIS', 'Wimbledon', 1), ('TENNIS', 'US Open', 2),
  ('TENNIS', 'Open d''Australie', 3), ('TENNIS', 'Masters 1000', 4), ('TENNIS', 'WTA 1000', 5),
  ('PING_PONG', 'Championnats du Monde', 0), ('PING_PONG', 'Coupe du Monde', 1),
  ('PING_PONG', 'Champions League ETTU', 2), ('PING_PONG', 'Championnats d''Europe', 3),
  ('BASKETBALL', 'NBA', 0), ('BASKETBALL', 'EuroLigue', 1), ('BASKETBALL', 'Betclic Élite', 2),
  ('BASKETBALL', 'Coupe du Monde FIBA', 3), ('BASKETBALL', 'Jeux Olympiques', 4),
  ('MMA', 'UFC', 0), ('MMA', 'Bellator', 1), ('MMA', 'PFL', 2), ('MMA', 'ONE Championship', 3),
  ('HANDBALL', 'Starligue', 0), ('HANDBALL', 'Ligue des champions EHF', 1),
  ('HANDBALL', 'Championnat du Monde', 2), ('HANDBALL', 'Jeux Olympiques', 3),
  ('VOLLEYBALL', 'Ligue A', 0), ('VOLLEYBALL', 'Ligue des champions CEV', 1),
  ('VOLLEYBALL', 'Championnat du Monde', 2), ('VOLLEYBALL', 'Jeux Olympiques', 3),
  ('ICE_HOCKEY', 'NHL', 0), ('ICE_HOCKEY', 'Championnat du Monde IIHF', 1),
  ('ICE_HOCKEY', 'Ligue Magnus', 2), ('ICE_HOCKEY', 'Jeux Olympiques', 3),
  ('BOXING', 'Championnat du Monde WBC', 0), ('BOXING', 'Championnat du Monde WBA', 1),
  ('BOXING', 'Championnat du Monde IBF', 2), ('BOXING', 'Championnat du Monde WBO', 3)
) as c(sport_key, name, sort_order)
join sports s on s.key = c.sport_key
on conflict (sport_id, name) do update set sort_order = excluded.sort_order;

-- ========================================================================
-- Row Level Security : verrouillée par défaut (pas de policy = pas d'accès
-- anon/authenticated). Seule la clé service_role peut lire/écrire.
-- ========================================================================
alter table users enable row level security;
alter table groups enable row level security;
alter table members enable row level security;
alter table sports enable row level security;
alter table competitions enable row level security;
alter table official_fixtures enable row level security;
alter table matches enable row level security;
alter table predictions enable row level security;
