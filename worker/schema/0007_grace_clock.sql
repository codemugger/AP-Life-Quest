-- Character schema v7: grace hours read like a clock (16 = yesterday stays open until 4 pm).
-- They used to count from the 4 am day start (12 = 4 pm), so saved values move over and
-- nothing closes earlier than before. Same SQL as GRACE_TO_CLOCK in worker/seeding.ts.
UPDATE settings SET value = printf('%g', CAST(value AS REAL) + COALESCE((SELECT CAST(value AS REAL) FROM settings WHERE key = 'day_start_hour'), 4))
  WHERE key = 'grace_hours' AND NOT EXISTS (SELECT 1 FROM settings WHERE key = 'grace_clock');
INSERT OR IGNORE INTO settings (key, value) SELECT 'grace_clock', 'true' WHERE EXISTS (SELECT 1 FROM settings);
