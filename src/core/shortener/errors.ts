import { MAX_URL_LENGTH } from "./entity";

export class ShortenerError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ShortenerError";
  }
}

export type ErrorKind =
  | "invalid_url"
  | "url_too_long"
  | "invalid_ttl"
  | "invalid_code"
  | "reserved_code"
  | "conflict"
  | "not_found"
  | "rate_limited"
  | "storage_unavailable";

export const ErrInvalidURL = () =>
  new ShortenerError("invalid_url", "url must be an absolute http or https address");
export const ErrUrlTooLong = () =>
  new ShortenerError("url_too_long", `url must be at most ${MAX_URL_LENGTH} characters`);
export const ErrInvalidTTL = () =>
  new ShortenerError("invalid_ttl", "ttlSeconds must be an integer greater than 0 and at most 31536000");
export const ErrInvalidCode = () =>
  new ShortenerError("invalid_code", "code must be 3-32 letters or digits");
export const ErrReservedCode = () => new ShortenerError("reserved_code", "code is reserved");
export const ErrConflict = () => new ShortenerError("conflict", "code already exists");
export const ErrNotFound = () => new ShortenerError("not_found", "not found");
export const ErrRateLimited = () => new ShortenerError("rate_limited", "rate limited");
/** The store refused the write, so the link does not exist. Distinct from a bug:
 * the daily write quota running out is the expected cause, and it resets. */
export const ErrStorageUnavailable = () =>
  new ShortenerError("storage_unavailable", "could not store link, try again later");

export function isKind(err: unknown, kind: ErrorKind): boolean {
  return err instanceof ShortenerError && err.kind === kind;
}
