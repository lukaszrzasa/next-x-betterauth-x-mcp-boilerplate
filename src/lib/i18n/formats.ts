import type { Formats } from "next-intl";

import { appConfig } from "@/src/lib/config";

/**
 * Named date and number presets, the one formatting contract for every
 * surface: pages and components through `useFormatter`/`getFormatter`,
 * emails and plain functions through `createFormatter` (see
 * `src/lib/date/format.ts`). Every instant is shown in UTC with the zone
 * named, so server-rendered and hydrated output never disagree and a reader
 * never has to guess the zone.
 */
export const formats = {
  dateTime: {
    /** "Sep 25, 2026" / "25 wrz 2026" */
    date: {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: appConfig.timeZone,
    },
    /** "Sep 25, 2026, 02:32 PM UTC" / "25 wrz 2026, 14:32 UTC" */
    dateTime: {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: appConfig.timeZone,
      timeZoneName: "short",
    },
  },
  number: {
    integer: { maximumFractionDigits: 0 },
  },
} as const satisfies Formats;

export type DateTimeFormatName = keyof typeof formats.dateTime;
