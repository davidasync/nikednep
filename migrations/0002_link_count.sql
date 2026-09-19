-- D1 meters rows *scanned*, so `SELECT COUNT(*) FROM links` costs one row read per
-- stored link. The shortener counts on every write to enforce the 50,000 link cap,
-- which at capacity burned ~50,000 reads per create against a 5M/day free tier.
--
-- Keep a running total in a single row instead, maintained by triggers so it stays
-- exact without the application having to remember to update it. Reading the cap
-- check is now one row read regardless of how many links are stored.

CREATE TABLE IF NOT EXISTS link_count (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  n  INTEGER NOT NULL DEFAULT 0
);

-- Seed from whatever is already stored. Costs one scan, once.
INSERT OR IGNORE INTO link_count (id, n) VALUES (1, (SELECT COUNT(*) FROM links));

-- An upsert that updates an existing code fires UPDATE, not INSERT, so replacing a
-- link leaves the total alone. Only genuinely new rows move it.
CREATE TRIGGER IF NOT EXISTS links_after_insert
AFTER INSERT ON links
BEGIN
  UPDATE link_count SET n = n + 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS links_after_delete
AFTER DELETE ON links
BEGIN
  UPDATE link_count SET n = n - 1 WHERE id = 1;
END;
