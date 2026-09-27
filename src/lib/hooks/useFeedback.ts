"use client";

import { useCallback, useState } from "react";

/** The latest outcome one section shows, and its dismissal. */
export function useFeedback<TFeedback>() {
  const [feedback, setFeedback] = useState<TFeedback | null>(null);
  const dismiss = useCallback(() => setFeedback(null), []);
  return { feedback, setFeedback, dismiss };
}
