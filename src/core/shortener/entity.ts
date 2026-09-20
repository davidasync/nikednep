export const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;
export const MAX_TTL_SECONDS = 365 * 24 * 60 * 60;
/** RFC 9110 sets no maximum URI length but recommends supporting at least 8000
 * octets, which is also where Apache, nginx and Tomcat put their defaults. The
 * older 2048 figure is Internet Explorer's buffer size, not a web standard, and
 * rejects legitimate signed and OAuth URLs. Measured in characters. */
export const MAX_URL_LENGTH = 8192;
export const GENERATED_CODE_LEN = 7;

export interface Link {
  code: string;
  url: string;
  createdAt: Date;
  expireAt: Date;
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
