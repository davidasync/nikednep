import type { Link } from "./entity";

export interface LinkRepository {
  /** Resolves to null when the code is unknown. */
  get(code: string): Promise<Link | null>;
  put(link: Link): Promise<void>;
  /** Deletes up to `limit` links that expired at or before `now`. Returns the codes deleted. */
  deleteExpired(now: Date, limit: number): Promise<string[]>;
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
