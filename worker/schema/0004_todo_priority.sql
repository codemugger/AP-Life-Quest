-- Character schema v4: to-do priorities (Eisenhower matrix: do / schedule / delegate / later).
-- Existing to-dos stay unsorted (NULL = no deadline penalty) until you give them a priority.
ALTER TABLE quests ADD COLUMN priority TEXT;
