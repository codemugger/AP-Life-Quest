-- v2: accounts, invites and characters.
-- Game data now lives in one private Durable Object database per character. The v1 game tables
-- in this database are left untouched (they can be imported into a character once).

CREATE TABLE users (
  id             INTEGER PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE,      -- lowercase login name
  display_name   TEXT NOT NULL,
  password_hash  TEXT NOT NULL,              -- pbkdf2$iter$salt$hash
  totp_secret    TEXT,                       -- base32, null = 2FA off
  totp_last      INTEGER,                    -- last accepted 30s step (codes can't be replayed)
  role           TEXT NOT NULL DEFAULT 'member', -- owner | member
  disabled       INTEGER NOT NULL DEFAULT 0,
  max_characters INTEGER NOT NULL DEFAULT 3,
  last_character TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_login     TEXT
);

CREATE TABLE invites (
  code_hash  TEXT PRIMARY KEY,              -- SHA-256 of the code (the code itself is shown once)
  code_hint  TEXT NOT NULL,                 -- last 4 characters, to recognise it in the list
  note       TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used_by    INTEGER,
  used_at    TEXT,
  revoked    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE characters (
  id          TEXT PRIMARY KEY,             -- random id; also names the Durable Object
  user_id     INTEGER NOT NULL,
  name        TEXT NOT NULL,
  template    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_played TEXT,
  deleted_at  TEXT
);
CREATE INDEX idx_characters_user ON characters(user_id, deleted_at);

-- Devices that logged in successfully before: they skip the per-user/global lock-outs
-- (so nobody can lock you out by spamming wrong passwords), but still need the password.
CREATE TABLE devices (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_devices_user ON devices(user_id);

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE sessions ADD COLUMN user_id INTEGER;
ALTER TABLE login_attempts ADD COLUMN username TEXT;
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_login_attempts_user ON login_attempts(username, ts);
