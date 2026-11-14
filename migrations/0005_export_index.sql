-- CSV export pages are `WHERE counted = 1 ... ORDER BY created_at, id LIMIT n` (keyset). Without this
-- index every page reads and sorts all counted rows, making the hourly export O(N^2 / page size).
CREATE INDEX idx_tests_export ON tests (counted, created_at, id);
