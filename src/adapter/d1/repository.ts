import type { Link } from "../../core/shortener/entity";
import type { LinkRepository } from "../../core/shortener/ports";

interface LinkRow {
  code: string;
  url: string;
  created_at: number;
  expire_at: number;
}

export function newRepository(db: D1Database): LinkRepository {
  return {
    async get(code: string): Promise<Link | null> {
      const row = await db
        .prepare("SELECT code, url, created_at, expire_at FROM links WHERE code = ?")
        .bind(code)
        .first<LinkRow>();
      return row === null ? null : toLink(row);
    },

    async put(link: Link): Promise<void> {
      await db
        .prepare(
          `INSERT INTO links (code, url, created_at, expire_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(code) DO UPDATE SET url = excluded.url,
                                           created_at = excluded.created_at,
                                           expire_at = excluded.expire_at`,
        )
        .bind(link.code, link.url, link.createdAt.getTime(), link.expireAt.getTime())
        .run();
    },

    async count(): Promise<number> {
      // One row read, whatever the table size. link_count is kept exact by the
      // triggers in migrations/0002_link_count.sql; a COUNT(*) here would scan
      // every link on every write and exhaust D1's free row-read quota.
      const row = await db.prepare("SELECT n FROM link_count WHERE id = 1").first<{ n: number }>();
      if (row !== null) {
        return row.n;
      }
      // Counter row missing rather than merely stale: rebuild it from a scan once
      // so a half-applied migration heals instead of silently disabling eviction.
      const scanned = await db.prepare("SELECT COUNT(*) AS n FROM links").first<{ n: number }>();
      const n = scanned?.n ?? 0;
      await db.prepare("INSERT OR REPLACE INTO link_count (id, n) VALUES (1, ?)").bind(n).run();
      return n;
    },

    async deleteOldest(n: number, exceptCode: string): Promise<string[]> {
      if (n <= 0) {
        return [];
      }
      const result = await db
        .prepare(
          `DELETE FROM links WHERE code IN (
             SELECT code FROM links WHERE code != ? ORDER BY created_at ASC LIMIT ?
           ) RETURNING code`,
        )
        .bind(exceptCode, n)
        .all<{ code: string }>();
      return result.results.map((row) => row.code);
    },
  };
}

function toLink(row: LinkRow): Link {
  return {
    code: row.code,
    url: row.url,
    createdAt: new Date(row.created_at),
    expireAt: new Date(row.expire_at),
  };
}
