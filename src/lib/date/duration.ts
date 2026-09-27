/**
 * Durations for people, not machines: the largest two units that matter,
 * rounded down, so a countdown never claims more time than is left.
 */

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;

/** "3h 12m left", "12m left", "40s left", or "expired" at zero and below. */
export function formatTimeLeft(seconds: number): string {
  if (seconds <= 0) return "expired";
  const hours = Math.floor(seconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  if (hours > 0) return `${hours}h ${minutes}m left`;
  if (minutes > 0) return `${minutes}m left`;
  return `${seconds}s left`;
}
