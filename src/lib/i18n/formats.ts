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
    /**
     * "02:32 PM" / "14:32". A date and a time are composed by
     * `formatUtcDateTime`, never asked of ICU as one pattern: the joiner of a
     * combined pattern ("," or "at") differs between ICU builds, and the
     * stored staff-log text and server-rendered markup must not depend on
     * which machine produced them.
     */
    time: {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: appConfig.timeZone,
    },
  },
  number: {
    integer: { maximumFractionDigits: 0 },
  },
} as const satisfies Formats;

export type DateTimeFormatName = keyof typeof formats.dateTime;

/** How a date and a time are joined, and the zone every instant is shown in. */
export const DATE_TIME_JOINER = ", ";
export const DATE_TIME_ZONE_LABEL = "UTC";
