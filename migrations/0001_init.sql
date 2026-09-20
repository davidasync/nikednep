-- Links are keyed by their short code. Timestamps are epoch milliseconds.
CREATE TABLE IF NOT EXISTS links (
  code       TEXT    PRIMARY KEY,
  url        TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  expire_at  INTEGER NOT NULL
);

-- The only index the app needs. Lookups go through the primary key, and the
-- hourly purge is the sole range query:
--
--   DELETE FROM links WHERE expire_at > 0 AND expire_at <= ?
--
-- Without this D1 would scan every row on each run, and D1 meters rows scanned.
--
-- created_at is kept as metadata but deliberately not indexed: nothing orders or
-- filters by it since FIFO eviction was removed, so an index would add write
-- amplification on every insert and delete for no reader.
CREATE INDEX IF NOT EXISTS idx_links_expire_at ON links (expire_at);
