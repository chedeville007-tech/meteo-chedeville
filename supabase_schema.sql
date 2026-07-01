-- ========================================================================
-- À exécuter dans Supabase : Dashboard -> SQL Editor -> New query -> Run
-- Ce script est ré-exécutable sans risque (idempotent) : tu peux le
-- relancer en entier après une mise à jour sans dupliquer quoi que ce soit.
-- ========================================================================

-- Si la table weather_history existait depuis une version précédente
-- (menu "Historique", maintenant supprimé), tu peux la supprimer avec :
-- drop table if exists weather_history;

-- Favoris : villes météo, actions/indices boursiers, arrêts de transport
create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  kind text not null check (kind in ('weather', 'stock', 'transit')),
  label text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, kind, label)
);

-- Notes libres
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  content text not null,
  created_at timestamptz not null default now()
);

-- Événements de calendrier
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  event_date date not null,
  note text,
  created_at timestamptz not null default now()
);

-- Réglages de profil (une seule ligne par utilisateur)
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_city text,
  default_activity text,
  unit_temp text not null default 'celsius' check (unit_temp in ('celsius', 'fahrenheit')),
  unit_wind text not null default 'kmh' check (unit_wind in ('kmh', 'mph')),
  updated_at timestamptz not null default now()
);

-- Tâches (à cocher, distinctes des notes libres)
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  done boolean not null default false,
  due_date date,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  created_at timestamptz not null default now()
);

-- ========================================================================
-- Row Level Security : chaque utilisateur ne voit / modifie QUE ses données
-- ========================================================================
alter table favorites enable row level security;
alter table notes enable row level security;
alter table events enable row level security;
alter table profiles enable row level security;
alter table tasks enable row level security;

drop policy if exists "Users manage their own favorites" on favorites;
create policy "Users manage their own favorites" on favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own notes" on notes;
create policy "Users manage their own notes" on notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own events" on events;
create policy "Users manage their own events" on events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own profile" on profiles;
create policy "Users manage their own profile" on profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own tasks" on tasks;
create policy "Users manage their own tasks" on tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
