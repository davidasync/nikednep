import { Hono } from "hono";
import { cors } from "hono/cors";

import type { Service } from "../../core/shortener/service";
import { newHandler } from "./handler";

export interface Env {
  LINKS: KVNamespace;
  RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  /** Comma-separated origin allowlist, set as a Worker var in wrangler.toml. */
  ALLOWED_ORIGINS?: string;
}

function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function newRouter(buildService: (env: Env) => Service): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  const h = newHandler();

  /**
   * Browsers may call `/api/shorten` from the allowlisted origins and read the
   * response. Everything else still works — curl and other non-browser clients
   * never send an `Origin`, and CORS is enforced by the browser, not here.
   *
   * An allowlist rather than `*`: the API is public, so this buys no real
   * protection, but it keeps the in-browser callers a known, short list. Unset
   * means no browser origin is allowed.
   *
   * Only the JSON API needs this. `GET /:code` is a redirect the browser
   * navigates to, never a fetch, so it has nothing to preflight.
   *
   * The middleware is built per request because `env` — and with it the
   * allowlist — only exists once a request is in flight.
   */
  app.use("/api/*", (c, next) =>
    cors({
      origin: allowedOrigins(c.env),
      allowMethods: ["POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
      maxAge: 86400,
    })(c, next),
  );

  app.get("/health", (c) => h.health(c));
  app.post("/api/shorten", (c) => h.shorten(c, buildService(c.env)));
  app.get("/:code", (c) => h.resolve(c, buildService(c.env)));

  return app;
}
