import "./globals.css";

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { AppShell } from "@/app/_/shell/AppShell";
import {
  SIDEBAR_COOKIE_NAME,
  readSidebarState,
} from "@/app/_/shell/sidebarState";
import { ViewerProvider } from "@/app/_/shell/ViewerProvider";
import { ThemeProvider } from "@/src/components/theme/ThemeProvider";
import { ActionProvider } from "@/src/lib/actions";
import { getFreshSession } from "@/src/lib/auth/session";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Boilerplate",
  description: "A starting point for building a new project.",
};

/** Request-dependent by design: resolves who is looking and the sidebar preference. */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [session, cookieStore] = await Promise.all([getFreshSession(), cookies()]);

  const viewer = session
    ? {
        name: session.user.name,
        email: session.user.email,
        image: session.user.image ?? null,
        role: session.user.role,
      }
    : null;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ui:h-full`}
    >
      <body className="ui:flex ui:min-h-full ui:flex-col">
        <ThemeProvider>
          <ViewerProvider viewer={viewer}>
            <ActionProvider>
              <AppShell
                defaultSidebarOpen={readSidebarState(
                  cookieStore.get(SIDEBAR_COOKIE_NAME)?.value,
                )}
              >
                {children}
              </AppShell>
            </ActionProvider>
          </ViewerProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
