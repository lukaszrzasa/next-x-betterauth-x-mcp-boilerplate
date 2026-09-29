import {
  authorize,
  type RouteDef,
  type RouteIcon,
  type Viewer,
} from "@/src/lib/access/routes";
import { adminRoutes } from "@/app/(AdminModule)/_/routes";
import { authRoutes } from "@/app/(AuthModule)/_/routes";
import { logsRoutes } from "@/app/(LogsModule)/_/routes";

/**
 * The dashboard navigation, composed from the modules' page declarations.
 * A page not listed here (settings, account) is reachable by URL only.
 * Group labels are staff-facing categories, not module names: a group may
 * list pages owned by several modules ("System" holds the logs module's lists).
 */

/** Only labelled, iconed page entries can be listed. */
export type NavigationItem = RouteDef & { label: string; icon: RouteIcon };

export type NavigationGroup = {
  label: string;
  items: readonly NavigationItem[];
};

export const navigation: readonly NavigationGroup[] = [
  { label: "General", items: [adminRoutes.dashboard, authRoutes.adminUsers] },
  { label: "System", items: [logsRoutes.staffLogs, logsRoutes.emailLogs] },
];

/** The groups a viewer may open, decided by the same rule that guards the pages. */
export function visibleNavigation(viewer: Viewer | null): NavigationGroup[] {
  return navigation
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => authorize(viewer, item.access)),
    }))
    .filter((group) => group.items.length > 0);
}
