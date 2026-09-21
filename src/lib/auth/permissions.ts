import { createAccessControl } from "better-auth/plugins/access";
import type { RoleAuthorizeRequest } from "better-auth/plugins/access";
import { defaultStatements, adminAc, userAc } from "better-auth/plugins/admin/access";

export const statement = {
  ...defaultStatements,
} as const;

export const ac = createAccessControl(statement);

export const roles = {
  user: ac.newRole({
    ...userAc.statements,
  }),

  moderator: ac.newRole({
    user: ["list", "update", "ban"],
  }),

  admin: ac.newRole({
    ...adminAc.statements,
  }),
} as const;

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

type Statements = typeof statement;

type Resource = keyof Statements & string;

type Action<TResource extends Resource> = Statements[TResource][number] & string;

/**
 * Every `"<resource>.<action>"` pair the statement allows - e.g. `"user.list"`.
 * Adding a resource to `statement` widens this union automatically.
 */
export type Permission = {
  [TResource in Resource]: `${TResource}.${Action<TResource>}`;
}[Resource];

/** Role names declared above: `"user" | "manager" | "admin"`. */
export type RoleName = keyof typeof roles;

/**
 * What `session.user.role` holds: a role name, a comma-separated list of them
 * ("admin,manager"), or nothing. The `string & {}` keeps the known role names in
 * editor autocomplete without rejecting other values.
 */
export type UserRole = RoleName | (string & {}) | null | undefined;

/** `"AND"` requires every permission, `"OR"` requires at least one. */
export type Connector = "AND" | "OR";

/* ---------------------------------------------------------------------------
 * can()
 * ------------------------------------------------------------------------- */

/**
 * Groups flat permissions by resource. The connector is repeated per resource
 * because `authorize()` only applies its own connector *between* resources -
 * within one it defaults to AND, which would break `can(role, ["user.list",
 * "user.ban"], "OR")`.
 */
function toRequest(
  permissions: readonly Permission[],
  connector: Connector,
): RoleAuthorizeRequest<Statements> {
  const grouped = new Map<string, string[]>();

  for (const permission of permissions) {
    const separator = permission.indexOf(".");
    const resource = permission.slice(0, separator);
    const action = permission.slice(separator + 1);

    const actions = grouped.get(resource);
    if (actions) {
      actions.push(action);
    } else {
      grouped.set(resource, [action]);
    }
  }

  return Object.fromEntries(
    [...grouped].map(([resource, actions]) => [resource, { actions, connector }]),
  ) as RoleAuthorizeRequest<Statements>;
}

/**
 * Checks a role against one or more permissions.
 *
 * ```ts
 * can(session.user.role, "user.list");
 * can(session.user.role, ["user.ban", "user.delete"]);              // AND
 * can(session.user.role, ["user.ban", "user.delete"], "OR");        // either
 * ```
 *
 * `admin` skips the statement check and is granted everything. Unknown roles
 * and an empty permission list both deny.
 */
export function can(
  role: UserRole,
  permissions: Permission | readonly Permission[],
  connector: Connector = "AND",
): boolean {
  const requested = typeof permissions === "string" ? [permissions] : permissions;

  if (requested.length === 0) {
    return false;
  }

  // Better Auth stores roles as a comma-separated list.
  const names = (role ?? "user").split(",").map((name) => name.trim());

  // admin bypasses the statement check entirely.
  if (names.includes("admin")) {
    return true;
  }

  const request = toRequest(requested, connector);

  // A user is allowed as soon as one of their roles grants the request.
  return names.some(
    (name) => roles[name as RoleName]?.authorize(request, connector).success === true,
  );
}
