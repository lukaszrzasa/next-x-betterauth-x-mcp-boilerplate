/**
 * Step-up ("2FA pool") configuration.
 *
 * A pool describes *how fresh* a second-factor verification has to be before an
 * action guarded by that pool will run. Actions name a pool; this file decides
 * what the name means.
 */

/**
 * Verification strength. A verification performed for a pool of importance N
 * satisfies any pool of importance <= N, never the other way round: stepping up
 * for something trivial must not unlock something dangerous.
 */
export const Importance = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
} as const;

export type Importance = (typeof Importance)[keyof typeof Importance];

export type PoolConfig = {
  /**
   * Seconds a verification stays usable for this pool. Measured against the
   * verification's own timestamp, so a long-lived LOW pool can still be
   * satisfied by a HIGH verification that has already expired for HIGH work.
   */
  timeWindow: number;
  importance: Importance;
  /**
   * Burn the verification on first use. Consume-once pools are kept entirely
   * outside the shared importance records: they never inherit another pool's
   * verification and never donate to one. Without this, `one_time` would be
   * satisfied by any LOW verification from the last five minutes - i.e. it
   * would mean nothing.
   */
  consumeOnce: boolean;
};

export const twoFactorPools = {
  default: { timeWindow: 5 * 60, importance: Importance.LOW, consumeOnce: false },
  one_time: { timeWindow: 10, importance: Importance.LOW, consumeOnce: true },
  sensitive: { timeWindow: 90, importance: Importance.HIGH, consumeOnce: false },
} as const satisfies Record<string, PoolConfig>;

export type TwoFactorPoolName = keyof typeof twoFactorPools;

export const DEFAULT_POOL: TwoFactorPoolName = "default";

/** How the second factor was proved. */
export type StepUpMethod = "totp" | "email";

/** Shared with Better Auth so replay protection covers its acceptance window. */
export const TOTP_PERIOD_SECONDS = 30;

const ALL_LEVELS: readonly Importance[] = [
  Importance.LOW,
  Importance.MEDIUM,
  Importance.HIGH,
];

/**
 * TTL for a stored verification at a given importance level.
 *
 * A level-3 record still has work to do long after HIGH pools stop accepting
 * it, because it also satisfies every LOW pool - so the TTL is the longest
 * window of any pool it could ever satisfy, not the window of the pool it was
 * created for. Expiring it earlier would silently re-prompt users mid-window.
 *
 * Consume-once pools are excluded: they do not share these records.
 */
const GRANT_TTL_BY_LEVEL: Record<Importance, number> = Object.fromEntries(
  ALL_LEVELS.map((level) => [
    level,
    Math.max(
      0,
      ...Object.values(twoFactorPools)
        .filter((pool) => !pool.consumeOnce && pool.importance <= level)
        .map((pool) => pool.timeWindow),
    ),
  ]),
) as Record<Importance, number>;

export function grantTtlSeconds(level: Importance): number {
  return GRANT_TTL_BY_LEVEL[level];
}

/** Importance levels that can satisfy `pool`, strongest first. */
export function satisfyingLevels(pool: PoolConfig): readonly Importance[] {
  return ALL_LEVELS.filter((level) => level >= pool.importance);
}
