"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import type { MessageKey, MessageValues } from "./messageKey";

/**
 * The whole catalog as one plain function: a typed key in, text out. Pure
 * helpers that build feedback (titles, descriptions, confirm requests) take
 * this rather than a hook result, so they stay testable and next-intl's
 * namespace-generic translator type never leaks into their signatures.
 */
export type CatalogTranslator = (key: MessageKey, values?: MessageValues) => string;

export function useCatalog(): CatalogTranslator {
  const t = useTranslations();
  return useMemo(
    () => (key: MessageKey, values?: MessageValues) =>
      (t as unknown as (key: string, values?: MessageValues) => string)(key, values),
    [t],
  );
}
