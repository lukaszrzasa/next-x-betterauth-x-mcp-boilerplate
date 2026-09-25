import { beforeEach, expect, mock, test } from "bun:test";

let rootUserId;
let hasUsers;
let failRead;
let installationReads;
let userReads;
const installation = { table: "installation" };
const user = { table: "user", id: "id" };

mock.module("server-only", () => ({}));
mock.module("../../src/lib/db/index.ts", () => ({
  installation,
  user,
  db: {
    select: () => ({
      from: (table) => ({
        limit: async () => {
          if (failRead) {
            throw new Error("database unavailable");
          }

          if (table === installation) {
            installationReads += 1;
            return rootUserId ? [{ rootUserId }] : [];
          }
          userReads += 1;
          return hasUsers ? [{ id: "existing-user" }] : [];
        },
      }),
    }),
  },
}));

const {
  loadInstallationState,
  getInstallationState,
  isInstallationComplete,
  markInstallationComplete,
} = await import("../../src/lib/auth/installation");

beforeEach(() => {
  delete globalThis.installationState;
  rootUserId = null;
  hasUsers = false;
  failRead = false;
  installationReads = 0;
  userReads = 0;
});

test("startup validates once and requests use the cached state", async () => {
  await loadInstallationState();
  expect(await getInstallationState()).toEqual({
    rootUserId: null,
    canSetup: true,
  });
  const results = await Promise.all(
    Array.from({ length: 20 }, () => isInstallationComplete()),
  );
  expect(results.every((value) => value === false)).toBe(true);
  expect(installationReads).toBe(1);
  expect(userReads).toBe(1);
});

test("an installation row is authoritative without inspecting users", async () => {
  rootUserId = "root-account";
  await loadInstallationState();
  expect(await isInstallationComplete()).toBe(true);
  expect(await getInstallationState()).toEqual({ rootUserId, canSetup: false });
  expect(installationReads).toBe(1);
  expect(userReads).toBe(0);
});

test("any user blocks setup when the installation record is absent", async () => {
  hasUsers = true;
  await loadInstallationState();
  expect(await getInstallationState()).toEqual({
    rootUserId: null,
    canSetup: false,
  });
  expect(await isInstallationComplete()).toBe(false);
});

test("successful setup updates cached state without another database read", async () => {
  await loadInstallationState();
  markInstallationComplete("new-root");
  expect(await isInstallationComplete()).toBe(true);
  expect(await getInstallationState()).toEqual({
    rootUserId: "new-root",
    canSetup: false,
  });
  expect(installationReads).toBe(1);
});

test("server restart revalidates rather than retaining the previous result", async () => {
  await loadInstallationState();
  rootUserId = "root-created-before-restart";
  await loadInstallationState();
  expect(await isInstallationComplete()).toBe(true);
  expect(installationReads).toBe(2);
});

test("a failed startup read is retried instead of being cached", async () => {
  failRead = true;
  await expect(loadInstallationState()).rejects.toThrow("database unavailable");
  failRead = false;
  rootUserId = "root-account";
  expect(await isInstallationComplete()).toBe(true);
  expect(installationReads).toBe(1);
});
