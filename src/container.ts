import { newRepository } from "./adapter/d1/repository";
import { withKVCache } from "./adapter/kv/cached-repository";
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
  const links = withKVCache(newRepository(env.DB), env.LINKS_CACHE);
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
