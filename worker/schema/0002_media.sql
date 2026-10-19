-- Character schema v2: pictures and links on everything you can create.
-- (0001 is migrations/0001_init.sql; every character database runs these in order.)

-- Pictures you upload. `images` columns below hold JSON arrays of media ids (first = cover/icon).
CREATE TABLE media (
  id         INTEGER PRIMARY KEY,
  mime       TEXT NOT NULL,
  width      INTEGER,
  height     INTEGER,
  size       INTEGER NOT NULL,
  data       BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE quests ADD COLUMN images TEXT;
ALTER TABLE quests ADD COLUMN link TEXT;
ALTER TABLE events ADD COLUMN images TEXT;
ALTER TABLE events ADD COLUMN link TEXT;
ALTER TABLE goals ADD COLUMN images TEXT;
ALTER TABLE goals ADD COLUMN link TEXT;
ALTER TABLE shop_items ADD COLUMN images TEXT;
ALTER TABLE vouchers ADD COLUMN images TEXT;
ALTER TABLE achievements ADD COLUMN images TEXT;
ALTER TABLE sprints ADD COLUMN images TEXT;
