import {
  DEFAULT_TTL_SECONDS,
  MAX_CODE_RETRIES,
  MAX_LINKS,
  MAX_TTL_SECONDS,
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

      const code = await assignCode(links, codes, cmd.code, now);

      await links.put({ code, url: dest, createdAt: now, expireAt });
      await evictIfNeeded(links, code);

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

async function evictIfNeeded(links: LinkRepository, exceptCode: string): Promise<void> {
  const n = await links.count();
  const overflow = n - MAX_LINKS;
  if (overflow <= 0) {
    return;
  }
  await links.deleteOldest(overflow, exceptCode);
}

function validateURL(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw ErrInvalidURL();
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
