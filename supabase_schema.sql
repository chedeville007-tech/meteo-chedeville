-- ========================================================================
-- MultiProno — À exécuter dans Supabase : Dashboard -> SQL Editor -> New query -> Run
-- Idempotent : rejouable sans risque après une mise à jour.
--
-- Important : cette app n'utilise PAS Supabase Auth (pas de compte via
-- auth.users) — l'authentification se fait par pseudo + code de groupe,
-- gérée côté serveur Flask. Le backend doit se connecter avec la clé
-- service_role (ou la connection string Postgres directe), qui bypass RLS.
-- Ne jamais utiliser la clé anon/public avec ces tables.
-- ========================================================================

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

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

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  sport_id uuid not null references sports(id),
  home_name text not null,
  away_name text not null,
  start_time timestamptz not null,
  status text not null default 'UPCOMING' check (status in ('UPCOMING', 'LIVE', 'FINISHED')),
  home_score integer,
  away_score integer,
  double_bonus boolean not null default false,
  created_at timestamptz not null default now(),
  -- identifiant du fixture cote fournisseur (ex: API-Football), pour eviter les doublons a l'import
  external_id text unique
);
alter table matches add column if not exists external_id text unique;

create table if not exists predictions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  predicted_outcome text not null check (predicted_outcome in ('HOME', 'AWAY', 'DRAW')),
  predicted_home_score integer,
  predicted_away_score integer,
  points integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, member_id)
);

create index if not exists idx_members_group on members(group_id);
create index if not exists idx_matches_group on matches(group_id);
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
  ('BASKETBALL', 'Basketball', false, '#ff9a3d', 5)
on conflict (key) do update set
  label = excluded.label,
  allow_draw = excluded.allow_draw,
  color = excluded.color,
  sort_order = excluded.sort_order;

-- ========================================================================
-- Row Level Security : verrouillée par défaut (pas de policy = pas d'accès
-- anon/authenticated). Seule la clé service_role peut lire/écrire.
-- ========================================================================
alter table users enable row level security;
alter table groups enable row level security;
alter table members enable row level security;
alter table sports enable row level security;
alter table matches enable row level security;
alter table predictions enable row level security;
