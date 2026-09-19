import type { Link } from "../../core/shortener/entity";
import type { LinkRepository } from "../../core/shortener/ports";

interface CachedLink {
  url: string;
  createdAt: number;
  expireAt: number;
}

/**
 * Wraps a LinkRepository with a KV read cache so hot redirects are served from the
 * edge instead of hitting D1. D1 stays the source of truth: every write goes through
 * to it first, and the cache entry carries the link's own TTL so it cannot outlive it.
 */
export function withKVCache(inner: LinkRepository, kv: KVNamespace): LinkRepository {
  return {
    async get(code: string): Promise<Link | null> {
      const cached = await kv.get<CachedLink>(code, "json");
      if (cached !== null) {
        return {
          code,
          url: cached.url,
          createdAt: new Date(cached.createdAt),
          expireAt: new Date(cached.expireAt),
        };
      }

      const link = await inner.get(code);
      if (link !== null) {
        await writeThrough(kv, link);
      }
      return link;
    },

    async put(link: Link): Promise<void> {
      await inner.put(link);
      await writeThrough(kv, link);
    },

    count(): Promise<number> {
      return inner.count();
    },

    async deleteOldest(n: number, exceptCode: string): Promise<string[]> {
      const evicted = await inner.deleteOldest(n, exceptCode);
      await Promise.all(evicted.map((code) => kv.delete(code)));
      return evicted;
    },
  };
}

async function writeThrough(kv: KVNamespace, link: Link): Promise<void> {
  const ttlSeconds = Math.floor((link.expireAt.getTime() - Date.now()) / 1000);
  // KV rejects a TTL under 60s; such a link is near death anyway, so skip caching it.
  if (ttlSeconds < 60) {
    return;
  }
  const value: CachedLink = {
    url: link.url,
    createdAt: link.createdAt.getTime(),
    expireAt: link.expireAt.getTime(),
  };
  await kv.put(link.code, JSON.stringify(value), { expirationTtl: ttlSeconds });
}
