import "server-only";

import { incrementWithTtl, redis } from "@/src/lib/redis";

/**
 * Shared-state throttling primitives. Both are atomic in Redis, so they hold
 * across application instances, and both fail closed: a Redis outage throws
 * and the caller's protected operation fails rather than proceeding
 * unthrottled. Callers own their keys and limits.
 */

export type ThrottleDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/** Seconds until `key` expires, never below 1 while the key exists. */
async function secondsUntilExpiry(key: string, fallback: number): Promise<number> {
  const ttl = await redis.ttl(key);
  return ttl > 0 ? ttl : fallback;
}

/** True while a cooldown key exists; read-only. */
export async function isCoolingDown(key: string): Promise<ThrottleDecision> {
  const ttl = await redis.ttl(key);
  return ttl > 0 ? { allowed: false, retryAfterSeconds: ttl } : { allowed: true };
}

/**
 * Claims a cooldown for `seconds` in one `SET NX EX`. Concurrent claimants
 * cannot both succeed; the loser learns how long to wait.
 */
export async function acquireCooldown(key: string, seconds: number): Promise<ThrottleDecision> {
  const claimed = await redis.set(key, "1", "EX", seconds, "NX");
  if (claimed === "OK") return { allowed: true };
  return { allowed: false, retryAfterSeconds: await secondsUntilExpiry(key, seconds) };
}

/**
 * Spends one unit of a fixed-window budget: the window starts at the first
 * use and does not slide. The unit stays spent when the caller's work
 * fails afterwards; that is the point of charging before acting.
 */
export async function consumeBudget(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<ThrottleDecision> {
  const used = await incrementWithTtl(key, windowSeconds);
  if (used <= limit) return { allowed: true };
  return { allowed: false, retryAfterSeconds: await secondsUntilExpiry(key, windowSeconds) };
}
