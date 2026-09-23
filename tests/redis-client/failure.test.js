import { expect, test } from "bun:test";
import { createServer } from "node:net";
import Redis from "ioredis";
import { redis } from "../../src/lib/redis";

test.each([false, true])("Redis requests fail within the configured bound (stalled server: %s)", async (stalled) => {
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    // Accept TCP but never answer Redis commands or the ready check.
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  if (!stalled) await new Promise((resolve) => server.close(resolve));
  const client = new Redis({
    host: "127.0.0.1", port,
    lazyConnect: true,
    maxRetriesPerRequest: redis.options.maxRetriesPerRequest,
    commandTimeout: redis.options.commandTimeout,
    connectTimeout: redis.options.connectTimeout,
  });
  client.on("error", () => {});
  try {
    const started = Date.now();
    await expect(client.get("verification-grant")).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(7_000);
  } finally {
    client.disconnect();
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
}, 10_000);
