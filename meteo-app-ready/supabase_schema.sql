-- ========================================================================
-- À exécuter dans Supabase : Dashboard -> SQL Editor -> New query -> Run
-- ========================================================================

-- Historique météo : une ligne par recherche effectuée par un utilisateur connecté
create table if not exists weather_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  city text not null,
  country text,
  activity text,
  searched_at timestamptz not null default now()
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

-- ========================================================================
-- Row Level Security : chaque utilisateur ne voit / modifie QUE ses données
-- ========================================================================
alter table weather_history enable row level security;
alter table notes enable row level security;
alter table events enable row level security;

create policy "Users manage their own history" on weather_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own notes" on notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own events" on events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
