"use client";

import { createContext, useContext, useMemo } from "react";
import { authorize, type Access } from "@/src/lib/access/routes";
import type { UserRole } from "@/src/lib/auth/permissions";

/** The signed-in account as the shell needs it; `null` for guests. */
export type ViewerInfo = {
  name: string;
  email: string;
  image: string | null;
  role: UserRole;
} | null;

type ViewerContextValue = {
  viewer: ViewerInfo;
  /** The same evaluator that guards pages, bound to the current viewer. */
  can: (access: Access) => boolean;
};

const ViewerContext = createContext<ViewerContextValue | null>(null);

/** Mounted once by the root layout, which resolves the fresh session. */
export function ViewerProvider({
  viewer,
  children,
}: {
  viewer: ViewerInfo;
  children: React.ReactNode;
}) {
  const value = useMemo<ViewerContextValue>(
    () => ({ viewer, can: (access) => authorize(viewer, access) }),
    [viewer],
  );

  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

export function useViewer(): ViewerContextValue {
  const context = useContext(ViewerContext);
  if (!context) throw new Error("useViewer requires ViewerProvider.");
  return context;
}
