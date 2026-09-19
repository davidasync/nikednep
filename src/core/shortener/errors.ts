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
  | "invalid_ttl"
  | "invalid_code"
  | "reserved_code"
  | "conflict"
  | "not_found"
  | "expired"
  | "rate_limited"
  | "generate_code";

export const ErrInvalidURL = () =>
  new ShortenerError("invalid_url", "url must be an absolute http or https address");
export const ErrInvalidTTL = () =>
  new ShortenerError("invalid_ttl", "ttlSeconds must be an integer greater than 0 and at most 31536000");
export const ErrInvalidCode = () =>
  new ShortenerError("invalid_code", "code must be 3-32 letters or digits");
export const ErrReservedCode = () => new ShortenerError("reserved_code", "code is reserved");
export const ErrConflict = () => new ShortenerError("conflict", "code already exists");
export const ErrNotFound = () => new ShortenerError("not_found", "not found");
export const ErrExpired = () => new ShortenerError("expired", "expired");
export const ErrRateLimited = () => new ShortenerError("rate_limited", "rate limited");
export const ErrGenerateCode = () =>
  new ShortenerError("generate_code", "could not generate a unique code");

export function isKind(err: unknown, kind: ErrorKind): boolean {
  return err instanceof ShortenerError && err.kind === kind;
}
