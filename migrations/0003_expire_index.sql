-- The hourly cleanup deletes by expire_at. Without an index that predicate scans
-- every link, which is the same trap the cap check fell into: D1 meters rows
-- scanned, so an unindexed sweep would cost one row read per stored link on
-- every run. With the index it seeks straight to the expired range.
CREATE INDEX IF NOT EXISTS idx_links_expire_at ON links (expire_at);
