/**
 * Durations for people, not machines: the largest two units that matter,
 * rounded down, so a countdown never claims more time than is left.
 */

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;

/** Which `common.timeLeft.*` message says it, and the values it needs. */
export type TimeLeft =
  | { key: "expired"; values: Record<string, never> }
  | { key: "hoursMinutes"; values: { hours: number; minutes: number } }
  | { key: "minutes"; values: { minutes: number } }
  | { key: "seconds"; values: { seconds: number } };

/** "3h 12m left", "12m left", "40s left", or "expired" at zero and below, as a message to render. */
export function describeTimeLeft(seconds: number): TimeLeft {
  if (seconds <= 0) return { key: "expired", values: {} };
  const hours = Math.floor(seconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  if (hours > 0) return { key: "hoursMinutes", values: { hours, minutes } };
  if (minutes > 0) return { key: "minutes", values: { minutes } };
  return { key: "seconds", values: { seconds } };
}

/** The text for a `TimeLeft`, given the `common.timeLeft` translator. */
export function formatTimeLeft(
  seconds: number,
  t: (key: TimeLeft["key"], values: Record<string, number>) => string,
): string {
  const left = describeTimeLeft(seconds);
  return t(left.key, left.values);
}
