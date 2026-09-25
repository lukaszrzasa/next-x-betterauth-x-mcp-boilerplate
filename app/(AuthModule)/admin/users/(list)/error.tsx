"use client";

import { ErrorState } from "@/src/components/feedback/ErrorState";

/** The list could not be loaded (a slow query, a database outage): safe message plus Retry. */
export default function UsersError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ErrorState
      title="Users could not be loaded"
      message="Something went wrong while loading the user list. Nothing was changed. Try again in a moment."
      retry={retry}
    />
  );
}
