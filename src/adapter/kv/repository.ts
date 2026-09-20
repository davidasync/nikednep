import { MAX_TTL_SECONDS, type Link } from "../../core/shortener/entity";
import { ErrStorageUnavailable } from "../../core/shortener/errors";
import type { LinkRepository } from "../../core/shortener/ports";

/** The stored value. `code` is the KV key, so it is not repeated here. */
interface StoredLink {
  url: string;
  createdAt: number;
  expireAt: number;
}

/** KV refuses any expiration less than 60 seconds into the future. */
const MIN_KV_TTL_SECONDS = 60;

/**
 * Links stored directly in Workers KV. KV expires keys itself, so there is no
 * sweep to run; the trade is that KV is eventually consistent and offers no
 * atomic writes, so a new link can be briefly unreadable and two concurrent
 * claims on one code resolve last-write-wins.
 */
export function newRepository(kv: KVNamespace): LinkRepository {
  return {
    async get(code: string): Promise<Link | null> {
      const stored = await kv.get<unknown>(code, "json");
      if (stored === null) {
        return null;
      }
      const link = decode(code, stored);
      if (link === null) {
        // Unusable data, not a storage outage: report it as a miss so the caller
        // gets a clean 404, and log it because it means something wrote a shape
        // this version does not understand.
        console.error("discarding malformed kv value", { code, stored });
      }
      return link;
    },

    async put(link: Link): Promise<void> {
      const value: StoredLink = {
        url: link.url,
        createdAt: link.createdAt.getTime(),
        expireAt: link.expireAt.getTime(),
      };
      try {
        await kv.put(link.code, JSON.stringify(value), {
          expirationTtl: kvTtlSeconds(link),
        });
      } catch (err) {
        // There is no second store to fall back on, so a refused write means the
        // link was not created. Say so rather than reporting it as a server bug —
        // exhausting the daily write quota is the expected cause and it resets.
        console.error("kv put failed", err);
        throw ErrStorageUnavailable();
      }
    },
  };
}

/**
 * A relational schema used to guarantee this shape; KV guarantees nothing, and
 * hands back whatever JSON is under the key. Validating here matters more than it
 * looks: an absent expireAt would become `new Date(undefined)`, whose getTime()
 * is NaN, and every comparison against NaN is false — so isExpired would answer
 * "not expired" and the link would redirect to `undefined` forever.
 */
function decode(code: string, value: unknown): Link | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { url, createdAt, expireAt } = value as Partial<StoredLink>;
  if (typeof url !== "string" || url === "") {
    return null;
  }
  if (!Number.isFinite(expireAt) || !Number.isFinite(createdAt)) {
    return null;
  }
  return {
    code,
    url,
    createdAt: new Date(createdAt as number),
    expireAt: new Date(expireAt as number),
  };
}

/**
 * KV's expiry is a cleanup mechanism, not the authority on whether a link is
 * still valid — the core decides that by comparing expireAt on read.
 *
 * That separation is what lets a sub-minute TTL work at all. KV rejects
 * anything under 60s, so a 30 second link is stored for 60 and simply reads as
 * expired for its final 30. Rounding up keeps the key alive slightly too long,
 * which is harmless; refusing to store it would lose the link outright.
 *
 * The upper clamp is belt and braces — resolveTTL already caps TTLs at a year,
 * so nothing should reach this — but expirationTtl is a 32-bit field and an
 * overflow here would throw on write rather than fail quietly.
 */
function kvTtlSeconds(link: Link): number {
  const remaining = Math.floor((link.expireAt.getTime() - Date.now()) / 1000);
  return Math.min(Math.max(remaining, MIN_KV_TTL_SECONDS), MAX_TTL_SECONDS);
}
