"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboardIcon,
  MailIcon,
  ScrollTextIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/src/components/ui/sidebar";
import { isRouteActive, type RouteIcon } from "@/src/lib/access/routes";
import { visibleNavigation } from "@/src/lib/app/navigation";
import { AppBrand } from "./AppBrand";
import { useViewer } from "./ViewerProvider";

const ICONS: Record<RouteIcon, LucideIcon> = {
  dashboard: LayoutDashboardIcon,
  users: UsersIcon,
  staffLogs: ScrollTextIcon,
  emailLogs: MailIcon,
};

export function AdminSidebar() {
  const pathname = usePathname();
  const { viewer } = useViewer();
  const { state, setOpenMobile } = useSidebar();
  const t = useTranslations();
  const groups = visibleNavigation(viewer);

  // History navigation (back/forward) changes the path without a link click.
  useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);

  return (
    <Sidebar>
      {/* Branding lives here on desktop; the top bar shows it on mobile, so the drawer omits it. */}
      <SidebarHeader className="ui:hidden ui:h-16 ui:justify-center ui:border-b ui:border-sidebar-border ui:px-4 ui:md:flex ui:group-data-[collapsible=icon]:px-2">
        <AppBrand compact={state === "collapsed"} />
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{t(group.label)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = ICONS[item.icon];
                  const active = isRouteActive(item, pathname);
                  const label = t(item.label);

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={label}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setOpenMobile(false)}
                        >
                          <Icon />
                          <span>{label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
