-- Precomputed public payloads (e.g. key 'stats' = the StatsResponse JSON), rebuilt by cron so requests
-- never aggregate over the tests table.
CREATE TABLE snapshots (
  key           TEXT PRIMARY KEY,
  body          TEXT NOT NULL,
  etag          TEXT NOT NULL,           -- strong ETag, quoted: hash of body
  generated_at  INTEGER NOT NULL         -- unix ms
);
