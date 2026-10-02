"use client";

import type { ComponentProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatUtcDateTime } from "@/src/lib/date/format";
import { Badge } from "@/src/components/ui/badge";
import { toIsoInstant } from "@/src/lib/date/format";
import { ROLE_NAMES, type RoleName } from "@/src/lib/auth/permissions";
import type { AccessStatus } from "@/app/(AuthModule)/admin/_/types";

/** The translator of role names; anything undeclared is shown as-is, escaped by React. */
export function useRoleLabel(): (role: string) => string {
  const t = useTranslations("authAdmin.badges.role");
  return (role) => ((ROLE_NAMES as readonly string[]).includes(role) ? t(role as RoleName) : role);
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
  const t = useTranslations("authAdmin.badges");
  const roleLabel = useRoleLabel();
  return (
    <ul aria-label={t("rolesLabel")} className="ui:flex ui:flex-wrap ui:gap-1">
      {roles.map((role) => (
        <li key={role}>
          <Badge variant={roleVariant(role)}>{roleLabel(role)}</Badge>
        </li>
      ))}
    </ul>
  );
}

export function VerificationBadge({ verified }: { verified: boolean }) {
  const t = useTranslations("authAdmin.badges");
  return verified ? (
    <Badge variant="secondary">{t("verified")}</Badge>
  ) : (
    <Badge variant="outline" className="ui:text-muted-foreground">
      {t("unverified")}
    </Badge>
  );
}

const ACCESS_KEYS = {
  active: "active",
  "temporarily-banned": "temporarilyBanned",
  "permanently-banned": "permanentlyBanned",
} as const;

export function AccessBadge({
  status,
  banExpires,
}: {
  status: AccessStatus;
  banExpires: string | null;
}) {
  const t = useTranslations("authAdmin.badges");
  const locale = useLocale();
  if (status === "active") return <Badge variant="outline">{t("access.active")}</Badge>;

  const expiry =
    status === "temporarily-banned" && banExpires
      ? t("banEnds", { date: formatUtcDateTime(banExpires, locale) })
      : undefined;

  return (
    <Badge variant="destructive" title={expiry}>
      {t(`access.${ACCESS_KEYS[status]}`)}
      {expiry && (
        <span className="ui:sr-only">
          , <time dateTime={toIsoInstant(banExpires ?? "")}>{expiry}</time>
        </span>
      )}
    </Badge>
  );
}
