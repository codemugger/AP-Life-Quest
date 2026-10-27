-- Character schema v5: repeat schedules (shared/schedule.ts).
-- Dailies: when set, the daily is due on the schedule's days instead of its weekday mask.
-- To-dos: finishing one creates the next occurrence (repeat_of points back at the one before).
ALTER TABLE quests ADD COLUMN repeat_rule TEXT;
ALTER TABLE quests ADD COLUMN repeat_of INTEGER;
