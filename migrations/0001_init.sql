-- One row per completed test the visitor agreed to contribute.
CREATE TABLE tests (
  id            TEXT PRIMARY KEY,            -- short public id used in share links (/r/:id)
  created_at    INTEGER NOT NULL,            -- unix ms
  day           TEXT NOT NULL,               -- YYYY-MM-DD in Asia/Taipei

  -- Server-observed (authoritative, from request.cf)
  colo          TEXT NOT NULL,               -- landing colo of OUR free-plan hostname
  country       TEXT,                        -- ISO alpha-2
  region_code   TEXT,                        -- ISO 3166-2 subdivision (TW county), e.g. TPE
  lat           REAL,                        -- city-level, rounded to 2 decimals
  lon           REAL,
  asn           INTEGER,
  isp_key       TEXT,                        -- see src/data/isps.ts, 'other' when unknown
  server_rtt    INTEGER,                     -- request.cf.clientTcpRtt ?? clientQuicRtt (ms)

  -- Client-measured
  rtt_ms        INTEGER NOT NULL,            -- median RTT to our hostname /cdn-cgi/trace
  ref_colo      TEXT,                        -- colo seen by cloudflare.com/cdn-cgi/trace
  ref_rtt_ms    INTEGER,                     -- median RTT to cloudflare.com/cdn-cgi/trace
  tz            TEXT,                        -- Intl timezone of the device
  conn          TEXT,                        -- navigator.connection.type when available

  -- Derived
  light         TEXT NOT NULL,               -- green | yellow | red | gray | blue
  category      TEXT NOT NULL,               -- tw | intl | vpn | roaming | foreign-sim
  distance_km   INTEGER,                     -- user -> landing colo
  extra_km      INTEGER,                     -- (user -> landing) - (user -> ref colo)
  counted       INTEGER NOT NULL DEFAULT 0,  -- 1 = included in Taiwan statistics
  flags         TEXT,                        -- comma separated anti-abuse flags, NULL when clean

  -- Anti-abuse (purged after 48h by cron)
  ip_hash       TEXT,                        -- HMAC(secret, day|ip), rotates daily
  device_hash   TEXT                         -- HMAC(secret, day|deviceId)
);

CREATE INDEX idx_tests_counted_day ON tests (counted, day);
CREATE INDEX idx_tests_category_day ON tests (category, day);
CREATE INDEX idx_tests_ip_day ON tests (ip_hash, day) WHERE ip_hash IS NOT NULL;
CREATE INDEX idx_tests_created ON tests (created_at);

-- Single-use test tokens (replay protection). Rows older than 1h are purged by cron.
CREATE TABLE nonces (
  nonce       TEXT PRIMARY KEY,
  created_at  INTEGER NOT NULL
);
