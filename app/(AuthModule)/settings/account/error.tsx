"use client";

import { ErrorState } from "@/src/components/feedback/ErrorState";

export default function AccountError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ErrorState
      title="Your account settings could not be loaded"
      message="Something went wrong while loading your account. Nothing was changed. Try again in a moment."
      retry={retry}
    />
  );
}
