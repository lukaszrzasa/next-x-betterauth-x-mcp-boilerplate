"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isRouteActive, type RouteDef } from "@/src/lib/access/routes";
import { AppBreadcrumbs } from "@/app/_/shell/AppBreadcrumbs";
import { appRoutes } from "@/app/_/routes";
import { authRoutes } from "@/app/(AuthModule)/_/routes";

type SettingsPage = RouteDef & { label: string };

/** Every settings page, in navigation order. Adding a page is one entry here. */
export const SETTINGS_PAGES: readonly SettingsPage[] = [authRoutes.settingsProfile, authRoutes.settingsAccount];

/** One page link. The active style keys off `aria-current`, so state and styling cannot disagree. */
function SettingsNavLink({ page, active }: { page: SettingsPage; active: boolean }) {
  return (
    <li>
      <Link
        href={page.href}
        aria-current={active ? "page" : undefined}
        className="ui:inline-flex ui:rounded-md ui:px-3 ui:py-2 ui:text-sm ui:font-medium ui:text-muted-foreground ui:transition-colors ui:hover:bg-accent ui:hover:text-accent-foreground ui:aria-[current=page]:bg-accent ui:aria-[current=page]:text-foreground ui:sm:rounded-none ui:sm:border-b-2 ui:sm:border-transparent ui:sm:hover:bg-transparent ui:sm:aria-[current=page]:border-foreground ui:sm:aria-[current=page]:bg-transparent"
      >
        {page.label}
      </Link>
    </li>
  );
}

/**
 * The settings pages, as declared routes: real links with `aria-current`,
 * laid out in a row on wide screens and stacked on narrow ones. Distinct
 * pages, not tab panels. Rendered by the settings layout, outside each
 * page's loading boundary, so switching pages never re-mounts it.
 */
export function SettingsNavigation() {
  const pathname = usePathname();
  const current = SETTINGS_PAGES.find((page) => isRouteActive(page, pathname));

  return (
    <div className="ui:flex ui:w-full ui:flex-col ui:gap-4">
      <AppBreadcrumbs
        items={[appRoutes.home, authRoutes.settings, ...(current ? [{ label: current.label }] : [])]}
      />
      <h1 className="ui:text-2xl ui:font-semibold ui:tracking-tight">Settings</h1>
      <nav aria-label="Settings">
        <ul className="ui:flex ui:flex-col ui:gap-1 ui:border-b ui:pb-2 ui:sm:flex-row ui:sm:gap-2 ui:sm:pb-0">
          {SETTINGS_PAGES.map((page) => (
            <SettingsNavLink key={page.href} page={page} active={page === current} />
          ))}
        </ul>
      </nav>
    </div>
  );
}
