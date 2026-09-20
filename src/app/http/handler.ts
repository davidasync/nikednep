import type { Context } from "hono";

import { ShortenerError, type ErrorKind } from "../../core/shortener/errors";
import type { Service } from "../../core/shortener/service";
import type { ErrorResponse, HealthResponse, ShortenRequest, ShortenResponse } from "./dto";

const STATUS_BY_KIND: Record<ErrorKind, 400 | 404 | 409 | 414 | 429> = {
  invalid_url: 400,
  // RFC 9110 defines 414 for a URI the server declines to process by length.
  url_too_long: 414,
  invalid_ttl: 400,
  invalid_code: 400,
  reserved_code: 400,
  conflict: 409,
  not_found: 404,
  expired: 404,
  rate_limited: 429,
  generate_code: 400,
};

export interface Handler {
  health(c: Context): Response;
  shorten(c: Context, svc: Service): Promise<Response>;
  resolve(c: Context, svc: Service): Promise<Response>;
}

export function newHandler(): Handler {
  return {
    health(c: Context): Response {
      return c.json<HealthResponse>({ ok: true });
    },

    async shorten(c: Context, svc: Service): Promise<Response> {
      let body: ShortenRequest;
      try {
        body = await c.req.json<ShortenRequest>();
      } catch {
        return error(c, 400, "url must be an absolute http or https address");
      }

      try {
        const result = await svc.shorten({
          url: typeof body.url === "string" ? body.url : "",
          code: typeof body.code === "string" ? body.code.trim() : "",
          ttlSeconds: typeof body.ttlSeconds === "number" ? body.ttlSeconds : undefined,
          clientIp: clientIP(c),
          host: c.req.header("host") ?? new URL(c.req.url).host,
          scheme: requestScheme(c),
        });

        return c.json<ShortenResponse>(
          {
            code: result.code,
            shortUrl: result.shortUrl,
            expireAt: result.expireAt.toISOString(),
          },
          201,
        );
      } catch (err) {
        return mapError(c, err);
      }
    },

    async resolve(c: Context, svc: Service): Promise<Response> {
      try {
        const dest = await svc.resolve(c.req.param("code") ?? "");
        return c.redirect(dest, 302);
      } catch (err) {
        return mapError(c, err);
      }
    },
  };
}

function mapError(c: Context, err: unknown): Response {
  if (err instanceof ShortenerError) {
    return error(c, STATUS_BY_KIND[err.kind], err.message);
  }
  console.error("unhandled error", err);
  return error(c, 500, "internal error");
}

function error(c: Context, status: 400 | 404 | 409 | 414 | 429 | 500, message: string): Response {
  return c.json<ErrorResponse>({ error: message }, status);
}

function clientIP(c: Context): string {
  const connecting = c.req.header("cf-connecting-ip");
  if (connecting) {
    return connecting;
  }
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const [first] = forwarded.split(",");
    return first.trim();
  }
  return "";
}

function requestScheme(c: Context): string {
  const proto = c.req.header("x-forwarded-proto");
  if (proto) {
    return proto;
  }
  return new URL(c.req.url).protocol === "http:" ? "http" : "https";
}
