import type { Link } from "./entity";

/**
 * Storage only has to hold a link under its code and hand it back. Expiry is the
 * store's alone: it is asked to keep a link until `expireAt` and the core never
 * re-checks, so a link exists exactly as long as the store keeps it.
 */
export interface LinkRepository {
  /** Resolves to null when the code is unknown. */
  get(code: string): Promise<Link | null>;
  put(link: Link): Promise<void>;
}

export interface RateLimiter {
  allow(ip: string): Promise<boolean>;
}

export interface Clock {
  now(): Date;
}

export interface CodeGenerator {
  next(): string;
}
