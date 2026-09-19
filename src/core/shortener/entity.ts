export const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;
export const MAX_TTL_SECONDS = 365 * 24 * 60 * 60;
export const MAX_LINKS = 50_000;
export const GENERATED_CODE_LEN = 7;
export const MIN_CUSTOM_CODE_LEN = 3;
export const MAX_CUSTOM_CODE_LEN = 32;
export const MAX_CODE_RETRIES = 5;

export interface Link {
  code: string;
  url: string;
  createdAt: Date;
  expireAt: Date;
}

export function isExpired(link: Link, now: Date): boolean {
  return link.expireAt.getTime() > 0 && now.getTime() >= link.expireAt.getTime();
}

export interface ShortenCommand {
  url: string;
  code: string;
  ttlSeconds?: number;
  clientIp: string;
  host: string;
  scheme: string;
}

export interface ShortenResult {
  code: string;
  shortUrl: string;
  expireAt: Date;
}
