-- MultiProno — schema SQLite

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    pseudo TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    UNIQUE (group_id, pseudo),
    UNIQUE (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS sports (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    allow_draw INTEGER NOT NULL DEFAULT 1,
    color TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    sport_id TEXT NOT NULL REFERENCES sports(id),
    home_name TEXT NOT NULL,
    away_name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'UPCOMING',
    home_score INTEGER,
    away_score INTEGER,
    double_bonus INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS predictions (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    predicted_outcome TEXT NOT NULL,
    predicted_home_score INTEGER,
    predicted_away_score INTEGER,
    points INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (match_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_members_group ON members(group_id);
CREATE INDEX IF NOT EXISTS idx_matches_group ON matches(group_id);
CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_predictions_member ON predictions(member_id);
