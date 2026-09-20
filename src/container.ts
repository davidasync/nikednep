import { newRepository } from "./adapter/kv/repository";
import { newClock } from "./adapter/clock/system";
import { newGenerator } from "./adapter/nanoid/generator";
import { newBindingLimiter } from "./adapter/ratelimit/binding";
import { newMemoryLimiter } from "./adapter/ratelimit/memory";
import type { RateLimiter } from "./core/shortener/ports";
import { newService, type Service } from "./core/shortener/service";
import type { Env } from "./app/http/router";

/**
 * Composition root: the only place that knows which adapter backs which port.
 * Replaces the Go build's dig container — plain wiring is enough at this size.
 */
export function buildService(env: Env): Service {
  // wrangler.toml is gitignored and the binding names in it are checked against
  // nothing — not tsc, not deploy. A checkout still naming this LINKS_CACHE would
  // otherwise surface as a TypeError from inside the adapter on every request.
  if (!env.LINKS) {
    throw new Error(
      "missing KV binding LINKS — add it to wrangler.toml (it was called LINKS_CACHE before D1 was removed)",
    );
  }
  const links = newRepository(env.LINKS);
  return newService(links, buildRateLimiter(env), newClock(), newGenerator());
}

let fallbackLimiter: RateLimiter | undefined;

function buildRateLimiter(env: Env): RateLimiter {
  if (env.RATE_LIMITER) {
    return newBindingLimiter(env.RATE_LIMITER);
  }
  // Kept across requests so the per-isolate window actually accumulates.
  fallbackLimiter ??= newMemoryLimiter();
  return fallbackLimiter;
}
