import type { Access } from "@/src/lib/access/routes";
import { buildRoute } from "@/src/lib/routes";
import { authRoutes } from "@/app/(AuthModule)/_/routes";
import { isSupportedEntityType, type EntityType } from "@/app/(LogsModule)/_/entityTypes";

/**
 * Where a captured entity snapshot links to in the dashboard. Links come
 * exclusively from this registry and the destination's own route
 * declaration - never from a URL stored in a log - and are shown only when
 * the destination's access rule admits the current viewer (the same
 * evaluator that guards that page). The stored label is displayed either
 * way; whether the entity still exists is the destination page's business,
 * so nothing is looked up before linking.
 *
 * Importing another module's route table is navigation, not a data lookup.
 */

type Destination = {
  access: Access;
  href: (id: string) => string;
};

/** One entry per supported entity type: adding a type fails to compile until it is routed here. */
const DESTINATIONS: Record<EntityType, Destination> = {
  user: {
    access: authRoutes.adminUser.access,
    href: (id) => buildRoute(authRoutes.adminUser.href, { userId: id }),
  },
};

export type EntityLink =
  | { status: "linked"; href: string }
  /** A supported type whose destination the viewer may not open: plain text. */
  | { status: "forbidden" }
  /** A historical type this release does not support: plain text and an indication. */
  | { status: "unsupported" };

export function resolveEntityLink(
  entity: { type: string; id: string },
  can: (access: Access) => boolean,
): EntityLink {
  if (!isSupportedEntityType(entity.type)) return { status: "unsupported" };
  const destination = DESTINATIONS[entity.type];
  return can(destination.access) ? { status: "linked", href: destination.href(entity.id) } : { status: "forbidden" };
}
