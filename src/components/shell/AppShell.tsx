"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  SidebarInset,
  SidebarLayout,
  SidebarProvider,
  useSidebar,
} from "@/src/components/ui/sidebar";
import { appRoutes } from "@/src/lib/app/routes";
import { authRoutes } from "@/app/(AuthModule)/_/routes";
import { AdminSidebar } from "./AdminSidebar";
import { AppHeader } from "./AppHeader";

export type ShellMode = "auth" | "admin" | "app";

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname === `${prefix}/` || pathname.startsWith(`${prefix}/`);
}

/** Which chrome a path receives: presentation only, access is decided per page. */
export function getShellMode(pathname: string): ShellMode {
  if (isUnder(pathname, authRoutes.views.href)) return "auth";
  if (isUnder(pathname, appRoutes.dashboard.href)) return "admin";
  return "app";
}

function SkipLink() {
  return (
    <a
      href="#main-content"
      className="ui:sr-only ui:focus:not-sr-only ui:focus:fixed ui:focus:top-2 ui:focus:left-2 ui:focus:z-50 ui:focus:rounded-md ui:focus:bg-background ui:focus:px-3 ui:focus:py-2 ui:focus:text-sm ui:focus:ring-2 ui:focus:ring-ring"
    >
      Skip to content
    </a>
  );
}

function ShellFrame({ mode, children }: { mode: ShellMode; children: React.ReactNode }) {
  const { setOpenMobile } = useSidebar();

  // The drawer belongs to the dashboard; leaving it must not carry the drawer along.
  useEffect(() => {
    if (mode !== "admin") {
      setOpenMobile(false);
    }
  }, [mode, setOpenMobile]);

  if (mode === "auth") {
    return <>{children}</>;
  }

  if (mode === "admin") {
    return (
      <SidebarLayout className="app-ui">
        <SkipLink />
        <AdminSidebar />
        <SidebarInset>
          <AppHeader mode="admin" />
          <main
            id="main-content"
            className="ui:flex ui:flex-1 ui:flex-col ui:gap-4 ui:p-4 ui:md:p-6"
          >
            {children}
          </main>
        </SidebarInset>
      </SidebarLayout>
    );
  }

  return (
    <div className="app-ui ui:flex ui:min-h-svh ui:w-full ui:flex-col">
      <SkipLink />
      <AppHeader mode="app" />
      <main
        id="main-content"
        className="ui:flex ui:flex-1 ui:flex-col ui:gap-4 ui:p-4 ui:md:p-6"
      >
        {children}
      </main>
    </div>
  );
}

/**
 * Persistent client composition around the route tree. The chrome follows the
 * pathname; who is looking comes from `ViewerProvider`, mounted above.
 */
export function AppShell({
  children,
  defaultSidebarOpen,
}: {
  children: React.ReactNode;
  defaultSidebarOpen: boolean;
}) {
  const mode = getShellMode(usePathname());

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <ShellFrame mode={mode}>{children}</ShellFrame>
    </SidebarProvider>
  );
}
