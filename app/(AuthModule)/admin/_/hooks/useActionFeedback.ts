"use client";

import { useCallback, useState } from "react";
import type { Feedback } from "./feedback";

/** The latest outcome shown by one section of the detail page, and its dismissal. */
export function useActionFeedback() {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const dismiss = useCallback(() => setFeedback(null), []);
  return { feedback, setFeedback, dismiss };
}
