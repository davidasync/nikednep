import type { Clock } from "../../core/shortener/ports";

export function newClock(): Clock {
  return { now: () => new Date() };
}
