-- The 50,000 link cap is gone, and with it the only caller of count(). The
-- counter table existed solely to make that check cheap, and its triggers fired
-- on every insert and delete to maintain a number nothing reads any more.
--
-- Storage is now bounded by MAX_URL_LENGTH instead, which caps what a single
-- link can cost rather than how many links may exist. Expired rows are reclaimed
-- by the hourly purge, so the table finds its own steady state.
DROP TRIGGER IF EXISTS links_after_insert;
DROP TRIGGER IF EXISTS links_after_delete;
DROP TABLE IF EXISTS link_count;
