import {
  DEFAULT_TTL_SECONDS,
  MAX_TTL_SECONDS,
  MAX_URL_LENGTH,
  type ShortenCommand,
  type ShortenResult,
} from "./entity";
import {
  ErrConflict,
  ErrInvalidCode,
  ErrInvalidTTL,
  ErrInvalidURL,
  ErrUrlTooLong,
  ErrNotFound,
  ErrReservedCode,
  ErrRateLimited,
} from "./errors";
import type { Clock, CodeGenerator, LinkRepository, RateLimiter } from "./ports";

const CUSTOM_CODE_PATTERN = /^[a-zA-Z0-9]{3,32}$/;

const RESERVED_CODES = new Set(["api", "health"]);

export interface Service {
  shorten(cmd: ShortenCommand): Promise<ShortenResult>;
  resolve(code: string): Promise<string>;
}

export function newService(
  links: LinkRepository,
  limit: RateLimiter,
  clock: Clock,
  codes: CodeGenerator,
): Service {
  return {
    async shorten(cmd: ShortenCommand): Promise<ShortenResult> {
      if (!(await limit.allow(cmd.clientIp))) {
        throw ErrRateLimited();
      }

      const dest = validateURL(cmd.url);
      const ttlMs = resolveTTL(cmd.ttlSeconds);

      const now = clock.now();
      const expireAt = new Date(now.getTime() + ttlMs);

      const code = await assignCode(links, codes, cmd.code);

      await links.put({ code, url: dest, createdAt: now, expireAt });

      const scheme = cmd.scheme || "http";
      return { code, shortUrl: `${scheme}://${cmd.host}/${code}`, expireAt };
    },

    async resolve(code: string): Promise<string> {
      const link = await links.get(code);
      if (link === null) {
        throw ErrNotFound();
      }
      // Expiry is KV's job alone: a key is gone when KV drops it, and until then
      // the link resolves. Nothing here re-checks expireAt.
      return link.url;
    },
  };
}

/**
 * A generated code is not checked for collisions, deliberately. The store caches
 * the fact that a key was absent, so reading a code just before writing it makes
 * the new link briefly unreadable in the region that created it — the one place a
 * shortener must never fail, since people click the link they just made. Not
 * reading is what keeps the create-then-click path working.
 *
 * What that costs: a collision silently overwrites instead of retrying. Seven
 * characters over a 62-character alphabet is 3.5e12 codes, so at this corpus size
 * the odds are on the order of one in a hundred thousand. A guaranteed 404 on
 * every new link is the worse trade.
 *
 * A requested code still has to be checked, because rejecting duplicates is the
 * point of asking for one. That read caches a miss and so carries the window;
 * a custom link may 404 briefly where it was created.
 */
async function assignCode(
  links: LinkRepository,
  codes: CodeGenerator,
  requested: string,
): Promise<string> {
  if (requested === "") {
    let code = codes.next();
    while (RESERVED_CODES.has(code.toLowerCase())) {
      code = codes.next();
    }
    return code;
  }

  validateCustomCode(requested);

  // A code is taken for exactly as long as KV holds it. An expired link has
  // already been dropped, so its code reads as free without any check here.
  const existing = await links.get(requested);
  if (existing === null) {
    return requested;
  }
  throw ErrConflict();
}


function validateURL(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw ErrInvalidURL();
  }
  // Checked before parsing so an oversized string is rejected cheaply, and
  // reported distinctly: it is a well-formed URL we decline, not a malformed one.
  if (trimmed.length > MAX_URL_LENGTH) {
    throw ErrUrlTooLong();
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw ErrInvalidURL();
  }
  if (parsed.host === "") {
    throw ErrInvalidURL();
  }
  const scheme = parsed.protocol.toLowerCase();
  if (scheme !== "http:" && scheme !== "https:") {
    throw ErrInvalidURL();
  }
  return trimmed;
}

function validateCustomCode(code: string): void {
  if (RESERVED_CODES.has(code.toLowerCase())) {
    throw ErrReservedCode();
  }
  if (!CUSTOM_CODE_PATTERN.test(code)) {
    throw ErrInvalidCode();
  }
}

/** Returns the TTL in milliseconds. */
function resolveTTL(ttlSeconds: number | undefined): number {
  const seconds = ttlSeconds ?? DEFAULT_TTL_SECONDS;
  if (!Number.isInteger(seconds) || seconds <= 0 || seconds > MAX_TTL_SECONDS) {
    throw ErrInvalidTTL();
  }
  return seconds * 1000;
}
