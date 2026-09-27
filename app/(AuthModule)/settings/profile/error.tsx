"use client";

import { ErrorState } from "@/src/components/feedback/ErrorState";

export default function ProfileError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ErrorState
      title="Your profile could not be loaded"
      message="Something went wrong while loading your profile. Nothing was changed. Try again in a moment."
      retry={retry}
    />
  );
}
