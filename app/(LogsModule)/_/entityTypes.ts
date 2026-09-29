/**
 * The entity types a log may reference. Recording accepts only these;
 * reading tolerates any historical value, because rows outlive the list.
 *
 * Stored as nonempty text, not a PostgreSQL enum, so adding a type here is a
 * code change only and never rewrites historical rows. Adding one means:
 * extend this list, give it a label below and, when it has an admin page, a
 * navigation entry in `admin/_/entityNavigation.ts`. Do not add speculative
 * types for modules that do not exist yet.
 */
export const ENTITY_TYPES = ["user"] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

/** Human labels for the supported types, e.g. for a type chip beside a snapshot. */
export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  user: "User",
};

/** Narrows an arbitrary stored value to a type this release supports. */
export function isSupportedEntityType(value: string): value is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(value);
}
