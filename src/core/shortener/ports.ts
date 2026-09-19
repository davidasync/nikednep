import type { Link } from "./entity";

export interface LinkRepository {
  /** Resolves to null when the code is unknown. */
  get(code: string): Promise<Link | null>;
  put(link: Link): Promise<void>;
  count(): Promise<number>;
  /** Deletes the n oldest links by createdAt, never touching exceptCode. Returns the codes deleted. */
  deleteOldest(n: number, exceptCode: string): Promise<string[]>;
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
