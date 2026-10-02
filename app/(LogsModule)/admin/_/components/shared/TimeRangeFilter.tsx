"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/src/components/ui/native-select";
import {
  CALENDAR_DATE_MAX,
  CALENDAR_DATE_MIN,
  LOG_RANGES,
  calendarDateSchema,
  type LogRange,
} from "@/app/(LogsModule)/admin/_/schema";

export type TimeRangeValue = { range: LogRange; from: string; to: string };

/** The `logsAdmin.shared` translator. */
type SharedTranslator = ReturnType<typeof useTranslations<"logsAdmin.shared">>;

function hintFor(t: SharedTranslator, reversed: boolean, outOfBounds: boolean): string {
  if (outOfBounds) return t("period.hint.bounds", { min: CALENDAR_DATE_MIN, max: CALENDAR_DATE_MAX });
  if (reversed) return t("period.hint.reversed");
  return t("period.hint.both");
}

/** "in the last 30 days", "between 2026-09-01 and 2026-09-27 (UTC)"; never used for all time. */
export function describePeriod(value: TimeRangeValue, t: SharedTranslator): string {
  if (value.range === "custom") return t("period.in.custom", { from: value.from, to: value.to });
  if (value.range === "all") return "";
  return t(`period.in.${value.range}`);
}

/**
 * The period filter. A relative range applies at once. "Custom dates" first
 * shows two date fields and applies only once both hold an ordered pair, so
 * the URL never carries an incomplete range (which would fall back to 30
 * days). Dates are whole UTC days, the end day included.
 */
export function TimeRangeFilter({
  value,
  pending,
  onChange,
}: {
  value: TimeRangeValue;
  pending: boolean;
  onChange: (next: TimeRangeValue) => void;
}) {
  const t = useTranslations("logsAdmin.shared");
  const ids = { range: useId(), from: useId(), to: useId(), hint: useId() };
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);

  // The URL changed (navigation, Back/Forward): show what it now says.
  if (shown.range !== value.range || shown.from !== value.from || shown.to !== value.to) {
    setShown(value);
    setDraft(value);
  }

  const valid = (date: string) => calendarDateSchema.safeParse(date).success;
  const applyDates = (from: string, to: string) => {
    setDraft({ range: "custom", from, to });
    if (valid(from) && valid(to) && from <= to && (from !== value.from || to !== value.to || value.range !== "custom")) {
      onChange({ range: "custom", from, to });
    }
  };
  const reversed = draft.range === "custom" && draft.from !== "" && draft.to !== "" && draft.from > draft.to;
  const outOfBounds = [draft.from, draft.to].some((date) => date !== "" && !valid(date));

  return (
    <>
      <div className="ui:flex ui:flex-col ui:gap-1.5">
        <Label htmlFor={ids.range} className="ui:text-xs ui:text-muted-foreground">
          {t("period.label")}
        </Label>
        <NativeSelect
          id={ids.range}
          value={draft.range}
          disabled={pending}
          onChange={(event) => {
            const range = event.target.value as LogRange;
            if (range === "custom") {
              setDraft({ range, from: value.from, to: value.to });
              return;
            }
            setDraft({ range, from: "", to: "" });
            onChange({ range, from: "", to: "" });
          }}
        >
          {LOG_RANGES.map((range) => (
            <NativeSelectOption key={range} value={range}>
              {t(`period.ranges.${range}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {draft.range === "custom" && (
        <>
          <div className="ui:flex ui:flex-col ui:gap-1.5">
            <Label htmlFor={ids.from} className="ui:text-xs ui:text-muted-foreground">
              {t("period.from")}
            </Label>
            <Input
              id={ids.from}
              type="date"
              value={draft.from}
              min={CALENDAR_DATE_MIN}
              max={draft.to || CALENDAR_DATE_MAX}
              disabled={pending}
              aria-invalid={reversed || outOfBounds || undefined}
              aria-describedby={ids.hint}
              className="ui:w-40"
              onChange={(event) => applyDates(event.target.value, draft.to)}
            />
          </div>
          <div className="ui:flex ui:flex-col ui:gap-1.5">
            <Label htmlFor={ids.to} className="ui:text-xs ui:text-muted-foreground">
              {t("period.to")}
            </Label>
            <Input
              id={ids.to}
              type="date"
              value={draft.to}
              min={draft.from || CALENDAR_DATE_MIN}
              max={CALENDAR_DATE_MAX}
              disabled={pending}
              aria-invalid={reversed || outOfBounds || undefined}
              aria-describedby={ids.hint}
              className="ui:w-40"
              onChange={(event) => applyDates(draft.from, event.target.value)}
            />
          </div>
          <p id={ids.hint} className="ui:basis-full ui:text-xs ui:text-muted-foreground" aria-live="polite">
            {hintFor(t, reversed, outOfBounds)}
          </p>
        </>
      )}
    </>
  );
}
