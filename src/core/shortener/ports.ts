import type { Link } from "./entity";

/**
 * Storage only has to hold a link under its code and hand it back. Expiry is not
 * its concern: the core decides what counts as expired, and the store is free to
 * reclaim keys on its own schedule.
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
