-- Links are keyed by their short code. Timestamps are epoch milliseconds so the
-- eviction ordering is a plain integer sort.
CREATE TABLE IF NOT EXISTS links (
  code       TEXT    PRIMARY KEY,
  url        TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  expire_at  INTEGER NOT NULL
);

-- Serves the FIFO eviction scan once the 50,000 link cap is hit.
CREATE INDEX IF NOT EXISTS idx_links_created_at ON links (created_at);
