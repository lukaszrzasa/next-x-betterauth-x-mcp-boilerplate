/**
 * Canonical date presentation. Every helper takes an instant (a `Date` or an
 * ISO 8601 string) and formats it in UTC, in English, with the same result
 * on the server and in the browser - there is no locale or timezone
 * negotiation, so server-rendered and hydrated output never disagree.
 *
 * Calendar dates without a time-of-day are a different concept and must not
 * be routed through these helpers to gain a timezone conversion.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toInstant(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

const pad = (part: number) => String(part).padStart(2, "0");

/** "25 Sep 2026" in UTC. */
export function formatUtcDate(value: Date | string): string {
  const date = toInstant(value);
  if (!date) return "Unknown";
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "25 Sep 2026, 14:32 UTC". */
export function formatUtcDateTime(value: Date | string): string {
  const date = toInstant(value);
  if (!date) return "Unknown";
  return `${formatUtcDate(date)}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

/** The machine-readable value for `<time dateTime>`. */
export function toIsoInstant(value: Date | string): string {
  const date = toInstant(value);
  return date ? date.toISOString() : "";
}
