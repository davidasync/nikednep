export interface ShortenRequest {
  url?: unknown;
  code?: unknown;
  ttlSeconds?: unknown;
}

export interface ShortenResponse {
  code: string;
  shortUrl: string;
  expireAt: string;
}

export interface ErrorResponse {
  error: string;
}

export interface HealthResponse {
  ok: boolean;
}
