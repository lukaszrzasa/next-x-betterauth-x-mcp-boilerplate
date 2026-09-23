import "dotenv/config";
import Redis from "ioredis";
import type { BetterAuthOptions } from "better-auth";

/**
 * Next's dev server re-evaluates this module on every hot reload. Without the
 * globalThis cache each reload would open another TCP connection and leave the
 * previous one dangling, so a long dev session eventually exhausts Redis'
 * connection limit. Production evaluates the module once and the cache is inert.
 */
const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL!, {
    // Redis remains mandatory. Bound requests while reconnecting in the background.
    maxRetriesPerRequest: 1,
    commandTimeout: 5_000,
    connectTimeout: 5_000,
    lazyConnect: true,
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

/**
 * INCR then EXPIRE would be two round trips with a gap in between: a crash or a
 * race after the INCR leaves a counter with no TTL, which then never resets and
 * locks the caller out forever. Lua runs both inside one Redis command.
 *
 * The TTL is set only when the counter is created (post-increment value of 1),
 * so the window expires a fixed time after the *first* request rather than
 * sliding forward on every hit.
 */
const INCREMENT_WITH_TTL = `
local value = redis.call('INCR', KEYS[1])
if value == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return value
`;

/**
 * Shared by the step-up failure counter, which needs the same "count within a
 * fixed window" semantics the rate limiter uses: the window starts at the first
 * failure rather than sliding forward with each one, so an attacker cannot hold
 * a lock open indefinitely by keeping the counter warm.
 */
export async function incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
  return (await redis.eval(INCREMENT_WITH_TTL, 1, key, ttlSeconds)) as number;
}

/**
 * Better Auth 1.7 widened this interface: on top of the `get`/`set`/`delete`
 * trio most examples show, it now requires `getAndDelete` and `increment`. All
 * five are mandatory - a three-method object no longer type-checks, and
 * secondary-storage rate limiting throws at runtime without `increment`.
 */
export const redisSecondaryStorage: NonNullable<BetterAuthOptions["secondaryStorage"]> = {
  get: async (key) => await redis.get(key),

  // GETDEL (Redis 6.2+) so a single-use token cannot be read twice by two
  // concurrent requests.
  getAndDelete: async (key) => await redis.getdel(key),

  increment: async (key, ttl) => (await redis.eval(INCREMENT_WITH_TTL, 1, key, ttl)) as number,

  set: async (key, value, ttl) => {
    if (ttl) await redis.set(key, value, "EX", ttl);
    else await redis.set(key, value);
  },

  delete: async (key) => {
    await redis.del(key);
  },
};
