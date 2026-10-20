-- Character schema v3: the notebook (binders, labels, rich notes) and the journal tracker.

-- Binders shown as tabs. kind 'journal' = entries are dated and feed the 📔 Journal tracker.
CREATE TABLE notebooks (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  emoji      TEXT NOT NULL DEFAULT '📒',
  color      TEXT NOT NULL DEFAULT 'lemon',
  kind       TEXT NOT NULL DEFAULT 'notes',   -- notes | journal
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE note_labels (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT
);

CREATE TABLE notes (
  id            INTEGER PRIMARY KEY,
  notebook_id   INTEGER,
  title         TEXT NOT NULL DEFAULT '',
  doc           TEXT,                          -- rich text: sanitised editor JSON (shared/notedoc.ts)
  preview       TEXT,                          -- the start of doc, for cards on the board
  text          TEXT NOT NULL DEFAULT '',      -- plain text, for search
  words         INTEGER NOT NULL DEFAULT 0,
  media_ids     TEXT,                          -- JSON array of pictures / voice memos the note uses
  cover         INTEGER,                       -- first picture (card cover)
  extras        TEXT,                          -- JSON {"audio":n,"tasks":[done,total]} for card chips
  color         TEXT,
  paper         TEXT NOT NULL DEFAULT 'plain', -- plain | lined | grid | dots
  font          TEXT NOT NULL DEFAULT 'quest',
  mood          TEXT,
  labels        TEXT,                          -- JSON array of note_labels ids
  pinned        INTEGER NOT NULL DEFAULT 0,
  pin_today     INTEGER NOT NULL DEFAULT 0,    -- also show on Camp
  archived      INTEGER NOT NULL DEFAULT 0,
  trashed_at    TEXT,
  journal_date  TEXT,                          -- journal entries: the day it counts for
  goal_id       INTEGER,
  sprint_id     INTEGER,
  event_id      INTEGER,
  remind_at     TEXT,                          -- ISO time (UTC)
  remind_repeat TEXT,                          -- daily | weekly | monthly
  rev           INTEGER NOT NULL DEFAULT 1,    -- bumps on every title/content change (edit conflicts)
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notes_board ON notes (trashed_at, archived, pinned, updated_at);
CREATE INDEX idx_notes_journal ON notes (journal_date) WHERE journal_date IS NOT NULL;

-- Characters that already exist get the starter binders, the journal tracker + quest and the
-- writing trophies. (New characters get them from their template when they are seeded.)
INSERT INTO notebooks (name, emoji, color, kind, sort)
  SELECT 'Notes', '📒', 'lemon', 'notes', 1 WHERE EXISTS (SELECT 1 FROM settings);
INSERT INTO notebooks (name, emoji, color, kind, sort)
  SELECT 'Journal', '📔', 'pink', 'journal', 2 WHERE EXISTS (SELECT 1 FROM settings);

INSERT INTO metrics (key, name, emoji, unit, mode, direction, target, decimals, builtin, active, sort)
  SELECT 'journal', 'Journal', '📔', 'words', 'set', 'up', 30, 0, 1, 1, 50
  WHERE EXISTS (SELECT 1 FROM settings) AND NOT EXISTS (SELECT 1 FROM metrics WHERE key = 'journal');

INSERT INTO quests (type, title, emoji, area, difficulty, ap, xp, hp_penalty, metric_key, metric_op, sort)
  SELECT 'daily', 'Write in your journal', '📔', 'mind', 'easy', 5, 15, 0, 'journal', '>=', 40
  WHERE EXISTS (SELECT 1 FROM settings) AND NOT EXISTS (SELECT 1 FROM quests WHERE metric_key = 'journal');

INSERT INTO achievements (key, name, emoji, description, rule, tier, ap, xp, sort)
  SELECT 'journal_first', 'Dear Diary', '📔', 'Write your first journal entry', '{"t":"metric_days","metric":"journal","n":1}', 'bronze', 20, 30, 60
  WHERE EXISTS (SELECT 1 FROM settings) AND NOT EXISTS (SELECT 1 FROM achievements WHERE key = 'journal_first');
INSERT INTO achievements (key, name, emoji, description, rule, tier, ap, xp, sort)
  SELECT 'journal_7', 'Scribe', '✍️', 'Journal 7 days in a row', '{"t":"metric_streak","metric":"journal","n":7}', 'silver', 50, 75, 61
  WHERE EXISTS (SELECT 1 FROM settings) AND NOT EXISTS (SELECT 1 FROM achievements WHERE key = 'journal_7');
INSERT INTO achievements (key, name, emoji, description, rule, tier, ap, xp, sort)
  SELECT 'journal_30', 'Chronicler', '📜', 'Journal 30 days in a row', '{"t":"metric_streak","metric":"journal","n":30}', 'gold', 100, 150, 62
  WHERE EXISTS (SELECT 1 FROM settings) AND NOT EXISTS (SELECT 1 FROM achievements WHERE key = 'journal_30');
INSERT INTO achievements (key, name, emoji, description, rule, tier, ap, xp, sort)
  SELECT 'journal_words', 'Wordsmith', '🖋️', 'Write 10,000 words in your journal', '{"t":"metric_total","metric":"journal","n":10000}', 'gold', 100, 150, 63
  WHERE EXISTS (SELECT 1 FROM settings) AND NOT EXISTS (SELECT 1 FROM achievements WHERE key = 'journal_words');
INSERT INTO achievements (key, name, emoji, description, rule, tier, ap, xp, sort)
  SELECT 'notes_25', 'Bookworm', '🗒️', 'Keep 25 notes in your notebook', '{"t":"notes","n":25}', 'bronze', 20, 30, 64
  WHERE EXISTS (SELECT 1 FROM settings) AND NOT EXISTS (SELECT 1 FROM achievements WHERE key = 'notes_25');
