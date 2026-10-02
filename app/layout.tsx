import "./globals.css";

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { AppShell } from "@/src/components/shell/AppShell";
import {
  SIDEBAR_COOKIE_NAME,
  readSidebarState,
} from "@/src/components/shell/sidebarState";
import { ViewerProvider } from "@/src/components/shell/ViewerProvider";
import { ConfirmDialogRoot } from "@/src/components/feedback/ConfirmDialog";
import { ThemeProvider } from "@/src/components/theme/ThemeProvider";
import { ActionProvider } from "@/src/lib/actions";
import { getFreshSession } from "@/src/lib/auth/session";
import { appConfig } from "@/src/lib/config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.meta");
  return {
    title: appConfig.appName,
    description: t("description"),
  };
}

/** Request-dependent by design: resolves who is looking, the language and the sidebar preference. */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [session, cookieStore, locale] = await Promise.all([getFreshSession(), cookies(), getLocale()]);

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
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ui:h-full`}
    >
      <body className="ui:flex ui:min-h-full ui:flex-col">
        <NextIntlClientProvider>
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
                <ConfirmDialogRoot />
              </ActionProvider>
            </ViewerProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
