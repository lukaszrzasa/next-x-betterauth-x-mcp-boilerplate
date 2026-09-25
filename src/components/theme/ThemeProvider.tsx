"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Persists the colour scheme in localStorage and mirrors it as the `dark`
 * class on `<html>`, which `globals.css` and the `ui:dark:` variant follow.
 * Mounted once in the root layout, above every application and auth layout.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
