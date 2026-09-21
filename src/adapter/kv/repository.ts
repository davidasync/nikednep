import { MAX_TTL_SECONDS, type Link } from "../../core/shortener/entity";
import { ErrStorageUnavailable } from "../../core/shortener/errors";
import type { LinkRepository } from "../../core/shortener/ports";

/** The stored value. `code` is the KV key, so it is not repeated here. */
interface StoredLink {
  url: string;
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
 * A relational schema used to guarantee this shape; KV guarantees nothing and
 * hands back whatever JSON is under the key, so a value written by a different
 * version — or by hand — would otherwise flow straight through as a redirect to
 * `undefined`. Rejecting it here is what keeps that a clean 404.
 */
function decode(code: string, value: unknown): Link | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { url, expireAt } = value as Partial<StoredLink>;
  if (typeof url !== "string" || url === "") {
    return null;
  }
  if (!Number.isFinite(expireAt)) {
    return null;
  }
  return {
    code,
    url,
    expireAt: new Date(expireAt as number),
  };
}

/**
 * KV is the only thing that expires a link: nothing re-checks expireAt on read,
 * so a key lives exactly as long as KV keeps it.
 *
 * That makes the 60s floor visible in behaviour. KV refuses any expiry nearer
 * than a minute, so a link asking for less than that is stored for 60 seconds
 * and keeps resolving for the whole minute, outliving the expireAt reported when
 * it was created. Accepted: rounding up keeps short-lived links working, where
 * refusing the write would lose them outright.
 *
 * The upper clamp is belt and braces — resolveTTL already caps TTLs at a year —
 * but expirationTtl is a 32-bit field and an overflow would throw on write.
 */
function kvTtlSeconds(link: Link): number {
  const remaining = Math.floor((link.expireAt.getTime() - Date.now()) / 1000);
  return Math.min(Math.max(remaining, MIN_KV_TTL_SECONDS), MAX_TTL_SECONDS);
}
