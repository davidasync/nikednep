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



    async deleteExpired(now: Date, limit: number): Promise<string[]> {
      if (limit <= 0) {
        return [];
      }
      // `expire_at > 0` mirrors isExpired(), which treats a zero timestamp as
      // "never expires" rather than "expired in 1970".
      const result = await db
        .prepare(
          `DELETE FROM links WHERE code IN (
             SELECT code FROM links
             WHERE expire_at > 0 AND expire_at <= ?
             ORDER BY expire_at ASC LIMIT ?
           ) RETURNING code`,
        )
        .bind(now.getTime(), limit)
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
