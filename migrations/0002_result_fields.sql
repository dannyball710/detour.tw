-- Fields a shared result page needs but 0001 did not keep.
ALTER TABLE tests ADD COLUMN region TEXT;   -- raw region name from Cloudflare (county level), fallback for unknown region_code
ALTER TABLE tests ADD COLUMN as_org TEXT;   -- network name, shown for ASNs we have not mapped to a brand

-- The per-device dedup check runs on every submit.
CREATE INDEX idx_tests_device_day ON tests (device_hash, day) WHERE device_hash IS NOT NULL;
