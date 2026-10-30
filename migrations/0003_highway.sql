-- v2.4: the Highway, your grid of favourite sites. Account-wide (same in every character).
CREATE TABLE highway (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  name       TEXT NOT NULL,
  url        TEXT NOT NULL,
  emoji      TEXT,
  icon_mode  TEXT NOT NULL DEFAULT 'auto',  -- auto (the site's logo) | emoji | image (your picture)
  icon       BLOB,                          -- the logo or picture, stored here (never hot-linked)
  icon_type  TEXT,
  icon_v     INTEGER NOT NULL DEFAULT 0,    -- bumps when the icon changes (cache-busting)
  icon_tried INTEGER NOT NULL DEFAULT 0,    -- the logo was looked up already
  logo_src   INTEGER NOT NULL DEFAULT 0,    -- which logo service to ask (0 page, 1 DuckDuckGo, 2 domain)
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_highway_user ON highway (user_id, sort);

-- the owner's starting set is added the first time their Highway is opened
ALTER TABLE users ADD COLUMN highway_seeded INTEGER NOT NULL DEFAULT 0;
