import { Hono } from "hono";

import type { Service } from "../../core/shortener/service";
import { newHandler } from "./handler";

export interface Env {
  LINKS: KVNamespace;
  RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

export function newRouter(buildService: (env: Env) => Service): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  const h = newHandler();

  app.get("/health", (c) => h.health(c));
  app.post("/api/shorten", (c) => h.shorten(c, buildService(c.env)));
  app.get("/:code", (c) => h.resolve(c, buildService(c.env)));

  return app;
}
