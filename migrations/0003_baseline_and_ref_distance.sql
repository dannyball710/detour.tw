-- 1 = included in the international baseline (intl / foreign-sim, unflagged, deduplicated like `counted`).
-- `counted` keeps meaning "included in the Taiwan statistics".
ALTER TABLE tests ADD COLUMN baseline INTEGER NOT NULL DEFAULT 0;

-- Distance user -> reference colo, computed from raw geo-IP coordinates at submit time
-- (stored lat/lon are coarsened to county level and cannot reproduce it).
ALTER TABLE tests ADD COLUMN ref_distance_km INTEGER;

CREATE INDEX idx_tests_baseline_day ON tests (baseline, day) WHERE baseline = 1;
