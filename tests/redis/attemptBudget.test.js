import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";

mock.module("server-only", () => ({}));
const url = process.env.REDIS_URL;
if (
  !url ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
)
  throw new Error("Redis integration tests require a local REDIS_URL.");
const { decrementIfExists, incrementWithTtl, redis } =
  await import("../../src/lib/redis");
const key = `test:stepup:${randomUUID()}:failures`;

beforeAll(() => redis.connect());
afterAll(async () => {
  try {
    await redis.del(key);
  } finally {
    redis.disconnect();
  }
});

test("a refund after the counter expired leaves no permanent key behind", async () => {
  expect(await incrementWithTtl(key, 900)).toBe(1);
  expect(await decrementIfExists(key)).toBe(0);
  expect(await redis.ttl(key)).toBeGreaterThan(890);

  await redis.del(key); // the window expired before the refund arrived
  expect(await decrementIfExists(key)).toBe(0);
  expect(await redis.exists(key)).toBe(0);

  // The next window starts clean with its own TTL.
  expect(await incrementWithTtl(key, 900)).toBe(1);
  expect(await redis.ttl(key)).toBeGreaterThan(890);
});
