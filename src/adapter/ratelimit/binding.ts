import type { RateLimiter } from "../../core/shortener/ports";

/**
 * Cloudflare's built-in rate limiting binding: free on every plan, enforced per
 * colo with no storage writes, so it costs nothing against the KV or D1 quotas.
 */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export function newBindingLimiter(binding: RateLimitBinding): RateLimiter {
  return {
    async allow(ip: string): Promise<boolean> {
      const { success } = await binding.limit({ key: ip || "unknown" });
      return success;
    },
  };
}
