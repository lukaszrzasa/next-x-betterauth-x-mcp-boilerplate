import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";

mock.module("server-only", () => ({}));
const { VERIFY_EMAIL_CHALLENGE } =
  await import("../../src/lib/auth/emailChallenge");
const url = process.env.REDIS_URL;
if (
  !url ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
)
  throw new Error("Redis integration tests require a local REDIS_URL.");
const redis = new Redis(url, {
  lazyConnect: true,
  retryStrategy: () => null,
  connectTimeout: 1500,
});
const prefix = `test:stepup:${randomUUID()}`;
const keys = [];
function scope() {
  const pair = [
    `${prefix}:${keys.length}:challenge`,
    `${prefix}:${keys.length}:failures`,
  ];
  keys.push(...pair);
  return pair;
}
const verify = (pair, hash) =>
  redis.eval(VERIFY_EMAIL_CHALLENGE, 2, ...pair, hash, 5, 900);
beforeAll(() => redis.connect());
afterAll(async () => {
  try {
    if (keys.length) await redis.del(...keys);
  } finally {
    redis.disconnect();
  }
});

test("a typo preserves challenge and expiry; a correct code consumes it", async () => {
  const pair = scope();
  await redis.set(pair[0], "correct-hash", "EX", 300);
  expect(await verify(pair, "wrong-hash")).toBe(0);
  expect(await redis.get(pair[0])).toBe("correct-hash");
  expect(await redis.ttl(pair[0])).toBeGreaterThan(290);
  expect(await redis.ttl(pair[1])).toBeGreaterThan(890);
  expect(await verify(pair, "correct-hash")).toBe(1);
  expect(await redis.mget(...pair)).toEqual([null, null]);
  expect(await verify(pair, "correct-hash")).toBe(0);
});

test("concurrent correct proofs execute exactly once", async () => {
  const pair = scope();
  await redis.set(pair[0], "correct-hash", "EX", 300);
  const results = await Promise.all(
    Array.from({ length: 10 }, () => verify(pair, "correct-hash")),
  );
  expect(results.filter((value) => value === 1)).toHaveLength(1);
});

test("concurrent guesses stop at five and replacing a code does not reset lockout", async () => {
  const pair = scope();
  await redis.set(pair[0], "correct-hash", "EX", 300);
  await Promise.all(
    Array.from({ length: 20 }, () => verify(pair, "wrong-hash")),
  );
  expect(await redis.get(pair[1])).toBe("5");
  expect(await verify(pair, "correct-hash")).toBe(-1);
  await redis.set(pair[0], "new-hash", "EX", 300);
  expect(await verify(pair, "new-hash")).toBe(-1);
});

test("expired challenges cannot verify", async () => {
  const pair = scope();
  await redis.set(pair[0], "correct-hash", "PX", 1);
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(await verify(pair, "correct-hash")).toBe(0);
});
