import "server-only";

import { db, installation, user } from "@/src/lib/db";

export type InstallationState = {
  /** Set once initial setup has committed the root account. */
  rootUserId: string | null;
  /** True only for an empty installation: no installation row and no users. */
  canSetup: boolean;
};

// The proxy and route handlers are bundled separately, so a module-level
// variable would exist once per bundle. Node.js proxy runs in-process, so the
// process global is the one place every bundle sees the same cached state.
const processGlobal = globalThis as typeof globalThis & {
  installationState?: Promise<InstallationState>;
};

async function queryInstallationState(): Promise<InstallationState> {
  const [installationRow] = await db.select().from(installation).limit(1);

  if (installationRow) {
    return { rootUserId: installationRow.rootUserId, canSetup: false };
  }

  const users = await db.select({ id: user.id }).from(user).limit(1);

  return { rootUserId: null, canSetup: users.length === 0 };
}

/** Read once at server startup (instrumentation) and cache the result. */
export function loadInstallationState(): Promise<InstallationState> {
  const state = queryInstallationState();

  processGlobal.installationState = state;

  // A failed read (database unavailable) must not be cached as the answer.
  state.catch(() => {
    if (processGlobal.installationState === state) {
      processGlobal.installationState = undefined;
    }
  });

  return state;
}

export function getInstallationState(): Promise<InstallationState> {
  return processGlobal.installationState ?? loadInstallationState();
}

export async function isInstallationComplete(): Promise<boolean> {
  return (await getInstallationState()).rootUserId !== null;
}

/** Called after the root account and installation row commit together. */
export function markInstallationComplete(rootUserId: string): void {
  processGlobal.installationState = Promise.resolve({
    rootUserId,
    canSetup: false,
  });
}
