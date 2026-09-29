"use client";

import { ErrorState } from "@/src/components/feedback/ErrorState";

/** The list could not be loaded (a slow query, a database outage): safe message plus Retry. */
export default function EmailLogsError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ErrorState
      title="Email logs could not be loaded"
      message="Something went wrong while loading the email logs. Nothing was changed. Try again in a moment."
      retry={retry}
    />
  );
}
