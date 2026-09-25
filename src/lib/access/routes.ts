import {
  can,
  hasRole,
  type Connector,
  type Permission,
  type RoleName,
  type UserRole,
} from "@/src/lib/auth/permissions";

/**
 * Declarative routes and page access. Each module declares its routes once
 * with `defineRoutes`: a plain path for flows and prefixes, a full entry
 * (href, label, what the page needs) for pages. Navigation, the page guard
 * and tests all read that table, so a page's rule lives next to its path and
 * nowhere else. Pure and isomorphic: no framework, no session
 * reads, safe in client bundles.
 */

export type Access =
  /** Anyone, signed in or not. */
  | "public"
  /** Any signed-in account. */
  | "session"
  /** A signed-in account holding at least one of `roles` and passing `perm`. */
  | {
      roles?: readonly RoleName[];
      perm?: Permission | readonly Permission[];
      /** How several `perm` entries combine; defaults to AND. */
      connector?: Connector;
    };

/** Serializable icon identifiers; the sidebar maps them to components. */
export type RouteIcon = "dashboard" | "users" | "auditLogs" | "emailLogs";

export type RouteDef = {
  href: string;
  access: Access;
  /** Shown in navigation and breadcrumbs; a plain-path entry has none. */
  label?: string;
  icon?: RouteIcon;
  /** Active-link matching for navigation: `exact` (default `section`, which includes descendants). */
  match?: "exact" | "section";
};

/** A table entry: a plain path (public, no label) or a full declaration. */
export type RouteInput = string | RouteDef;

type NormalizedRoute<T extends RouteInput> = T extends string
  ? { href: T; access: "public"; label?: undefined; icon?: undefined; match?: undefined }
  : T;

export type RouteTable<T extends Record<string, RouteInput>> = {
  readonly [K in keyof T]: NormalizedRoute<T[K]>;
};

/** Who is asking. `null` is a guest. */
export type Viewer = { role?: UserRole };

/**
 * One table per module. Every entry comes out as the same shape, so `.href`
 * is always the path; a string entry is a public route with no label.
 */
export function defineRoutes<const T extends Record<string, RouteInput>>(
  routes: T,
): RouteTable<T> {
  return Object.fromEntries(
    Object.entries(routes).map(([key, value]) => [
      key,
      typeof value === "string" ? { href: value, access: "public" } : value,
    ]),
  ) as RouteTable<T>;
}

/** The one evaluator for page access; multiple roles are honoured by `hasRole`/`can`. */
export function authorize(viewer: Viewer | null, access: Access): boolean {
  if (access === "public") {
    return true;
  }

  if (!viewer) {
    return false;
  }

  if (access === "session") {
    return true;
  }

  if (access.roles && !hasRole(viewer.role, access.roles)) {
    return false;
  }

  if (access.perm && !can(viewer.role, access.perm, access.connector)) {
    return false;
  }

  return true;
}

/** Highlighting only; it grants nothing. */
export function isRouteActive(
  route: Pick<RouteDef, "href" | "match">,
  pathname: string,
): boolean {
  const path =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

  if (path === route.href) {
    return true;
  }

  return route.match !== "exact" && path.startsWith(`${route.href}/`);
}
