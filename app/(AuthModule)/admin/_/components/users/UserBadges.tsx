import type { ComponentProps } from "react";
import { Badge } from "@/src/components/ui/badge";
import { formatUtcDateTime, toIsoInstant } from "@/src/lib/date/format";
import type { RoleName } from "@/src/lib/auth/permissions";
import type { AccessStatus } from "@/app/(AuthModule)/admin/_/types";

/** One label per declared role: adding a role to the auth config fails to compile until it is named here. */
export const ROLE_LABELS: Record<RoleName, string> = {
  user: "User",
  moderator: "Moderator",
  admin: "Admin",
};

/** Readable names for known roles; anything else is shown as-is, escaped by React. */
export function roleLabel(role: string): string {
  return (ROLE_LABELS as Record<string, string | undefined>)[role] ?? role;
}

/** Staff roles stand out; `user` and anything unknown stay quiet. */
const ROLE_VARIANTS: Record<RoleName, ComponentProps<typeof Badge>["variant"]> = {
  admin: "default",
  moderator: "secondary",
  user: "outline",
};

function roleVariant(role: string): ComponentProps<typeof Badge>["variant"] {
  return (ROLE_VARIANTS as Record<string, ComponentProps<typeof Badge>["variant"]>)[role] ?? "outline";
}

export function RoleBadges({ roles }: { roles: readonly string[] }) {
  return (
    <ul aria-label="Roles" className="ui:flex ui:flex-wrap ui:gap-1">
      {roles.map((role) => (
        <li key={role}>
          <Badge variant={roleVariant(role)}>{roleLabel(role)}</Badge>
        </li>
      ))}
    </ul>
  );
}

export function VerificationBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <Badge variant="secondary">Verified</Badge>
  ) : (
    <Badge variant="outline" className="ui:text-muted-foreground">
      Unverified
    </Badge>
  );
}

export const ACCESS_LABELS: Record<AccessStatus, string> = {
  active: "Active",
  "temporarily-banned": "Temporarily banned",
  "permanently-banned": "Permanently banned",
};

export function AccessBadge({
  status,
  banExpires,
}: {
  status: AccessStatus;
  banExpires: string | null;
}) {
  if (status === "active") return <Badge variant="outline">Active</Badge>;

  const expiry =
    status === "temporarily-banned" && banExpires
      ? `Ban ends ${formatUtcDateTime(banExpires)}`
      : undefined;

  return (
    <Badge variant="destructive" title={expiry}>
      {ACCESS_LABELS[status]}
      {expiry && (
        <span className="ui:sr-only">
          , <time dateTime={toIsoInstant(banExpires ?? "")}>{expiry}</time>
        </span>
      )}
    </Badge>
  );
}
