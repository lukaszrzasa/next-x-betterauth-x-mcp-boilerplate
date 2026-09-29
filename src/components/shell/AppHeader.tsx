"use client";

import { Separator } from "@/src/components/ui/separator";
import { SidebarTrigger } from "@/src/components/ui/sidebar";
import { ThemeToggle } from "@/src/components/theme/ThemeToggle";
import { AppBrand } from "./AppBrand";
import { UserMenu } from "./UserMenu";

/**
 * The top bar shared by public and dashboard pages. In dashboard mode the
 * desktop sidebar carries the branding, so the bar shows it on mobile only
 * and adds the sidebar toggle.
 */
export function AppHeader({ mode }: { mode: "app" | "admin" }) {
  return (
    <header className="ui:sticky ui:top-0 ui:z-10 ui:flex ui:h-16 ui:shrink-0 ui:items-center ui:gap-2 ui:border-b ui:bg-background ui:px-4 ui:md:px-6">
      {mode === "admin" ? (
        <>
          <SidebarTrigger className="ui:-ml-1" />
          <Separator
            orientation="vertical"
            className="ui:mr-1 ui:data-[orientation=vertical]:h-4 ui:md:hidden"
          />
          <AppBrand className="ui:md:hidden" />
        </>
      ) : (
        <AppBrand />
      )}
      <div className="ui:ml-auto ui:flex ui:items-center ui:gap-2">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
