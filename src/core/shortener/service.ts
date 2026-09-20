import {
  DEFAULT_TTL_SECONDS,
  MAX_CODE_RETRIES,
  MAX_TTL_SECONDS,
  MAX_URL_LENGTH,
  PURGE_BATCH,
  isExpired,
  type ShortenCommand,
  type ShortenResult,
} from "./entity";
import {
  ErrConflict,
  ErrExpired,
  ErrGenerateCode,
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
  /** Removes links whose TTL has run out. Returns how many went. */
  purgeExpired(): Promise<number>;
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

      const code = await assignCode(links, codes, cmd.code, now);

      await links.put({ code, url: dest, createdAt: now, expireAt });

      const scheme = cmd.scheme || "http";
      return { code, shortUrl: `${scheme}://${cmd.host}/${code}`, expireAt };
    },

    async resolve(code: string): Promise<string> {
      const link = await links.get(code);
      if (link === null) {
        throw ErrNotFound();
      }
      if (isExpired(link, clock.now())) {
        throw ErrExpired();
      }
      return link.url;
    },

    async purgeExpired(): Promise<number> {
      // Expiry is only ever checked on read, so without this the rows linger
      // and hold storage indefinitely. Nothing else reclaims them.
      const purged = await links.deleteExpired(clock.now(), PURGE_BATCH);
      return purged.length;
    },
  };
}

async function assignCode(
  links: LinkRepository,
  codes: CodeGenerator,
  requested: string,
  now: Date,
): Promise<string> {
  if (requested === "") {
    for (let i = 0; i < MAX_CODE_RETRIES; i++) {
      const code = codes.next();
      if (RESERVED_CODES.has(code.toLowerCase())) {
        continue;
      }
      const existing = await links.get(code);
      if (existing === null || isExpired(existing, now)) {
        return code;
      }
    }
    throw ErrGenerateCode();
  }

  validateCustomCode(requested);

  const existing = await links.get(requested);
  if (existing === null || isExpired(existing, now)) {
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
