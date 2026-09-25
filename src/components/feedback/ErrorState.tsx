"use client";

import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";

/**
 * What a route segment shows when its data could not be loaded: a safe
 * message (never the error's details) and a Retry that re-renders the
 * segment. Used by `error.tsx` files.
 */
export function ErrorState({
  title,
  message,
  retry,
}: {
  title: string;
  message: string;
  retry: () => void;
}) {
  return (
    <div
      role="alert"
      className="ui:flex ui:flex-col ui:items-center ui:gap-3 ui:rounded-xl ui:border ui:bg-card ui:px-6 ui:py-12 ui:text-center"
    >
      <AlertTriangleIcon aria-hidden="true" className="ui:size-6 ui:text-muted-foreground" />
      <div className="ui:flex ui:flex-col ui:gap-1">
        <h2 className="ui:text-base ui:font-semibold">{title}</h2>
        <p className="ui:max-w-prose ui:text-sm ui:text-muted-foreground">{message}</p>
      </div>
      <Button type="button" variant="outline" onClick={() => retry()}>
        Retry
      </Button>
    </div>
  );
}
