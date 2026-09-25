"use client";

import { ErrorState } from "@/src/components/feedback/ErrorState";

export default function UserError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ErrorState
      title="This user could not be loaded"
      message="Something went wrong while loading the account. Nothing was changed. Try again in a moment."
      retry={retry}
    />
  );
}
