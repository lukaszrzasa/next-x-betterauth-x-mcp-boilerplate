"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { LogOutIcon } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { toIsoInstant } from "@/src/lib/date/format";
import { withQuery } from "@/src/lib/routes";
import { describeUserAgent, deviceWording } from "@/src/lib/userAgent";
import { authRoutes } from "@/app/(AuthModule)/_/routes";
import type { SessionItem, SessionPage } from "@/app/(AuthModule)/_/types/settings";

export const SESSIONS_PAGE_PARAM = "sessions";

const pageHref = (page: number) =>
  withQuery(authRoutes.settingsAccount.href, { [SESSIONS_PAGE_PARAM]: page > 1 ? page : null });

/**
 * One signed-in device: a generic label with the raw agent in the details,
 * when it signed in and the reported IP, and a Sign out control for every
 * session but the current one.
 */
function SessionRow({
  session,
  pending,
  onRevoke,
}: {
  session: SessionItem;
  pending: boolean;
  onRevoke: (session: SessionItem) => void;
}) {
  const t = useTranslations("auth.settings.sessions");
  const tDevice = useTranslations("common.device");
  const format = useFormatter();
  return (
    <li className="ui:flex ui:flex-col ui:gap-2 ui:py-3 ui:first:pt-0 ui:sm:flex-row ui:sm:items-start ui:sm:justify-between ui:sm:gap-6">
      <div className="ui:min-w-0 ui:text-sm">
        <p className="ui:flex ui:flex-wrap ui:items-center ui:gap-2 ui:font-medium">
          {describeUserAgent(session.userAgent, deviceWording(tDevice))}
          {session.isCurrent && <Badge variant="secondary">{t("thisDevice")}</Badge>}
        </p>
        <p className="ui:text-muted-foreground">
          {t("signedIn")}{" "}
          <time dateTime={toIsoInstant(session.createdAt)}>
            {format.dateTime(new Date(session.createdAt), "dateTime")}
          </time>
          {" · "}
          {t("ip", { ip: session.ipAddress ?? t("unknownIp") })}
        </p>
        {session.userAgent && (
          <details className="ui:mt-1 ui:text-xs ui:text-muted-foreground">
            <summary className="ui:cursor-pointer">{t("details")}</summary>
            <p className="ui:mt-1 ui:break-all">{session.userAgent}</p>
            <p>{t("expires", { time: format.dateTime(new Date(session.expiresAt), "dateTime") })}</p>
          </details>
        )}
      </div>
      {!session.isCurrent && (
        <div className="ui:shrink-0">
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => onRevoke(session)}>
            <LogOutIcon aria-hidden="true" />
            {t("signOut")}
          </Button>
        </div>
      )}
    </li>
  );
}

/** A page link, or its inert placeholder at either end of the range. */
function PageLink({ page, enabled, children }: { page: number; enabled: boolean; children: ReactNode }) {
  return (
    <Button asChild size="sm" variant="outline">
      {enabled ? <Link href={pageHref(page)}>{children}</Link> : <span aria-disabled="true">{children}</span>}
    </Button>
  );
}

/** The count, and Previous/Next as real links so the server re-reads and clamps the page. */
function SessionPagination({ sessions }: { sessions: SessionPage }) {
  const t = useTranslations("auth.settings.sessions");
  const lastPage = Math.max(1, Math.ceil(sessions.total / sessions.pageSize));
  const paged = lastPage > 1;

  return (
    <div className="ui:flex ui:flex-wrap ui:items-center ui:justify-between ui:gap-2 ui:text-sm ui:text-muted-foreground">
      <p>
        {t("count", { total: sessions.total })}
        {paged && t("pageOf", { page: sessions.page, pages: lastPage })}
      </p>
      {paged && (
        <nav aria-label={t("pagesLabel")} className="ui:flex ui:gap-2">
          <PageLink page={sessions.page - 1} enabled={sessions.page > 1}>
            {t("previous")}
          </PageLink>
          <PageLink page={sessions.page + 1} enabled={sessions.page < lastPage}>
            {t("next")}
          </PageLink>
        </nav>
      )}
    </div>
  );
}

/** The owned sessions as responsive rows, the current device first and labelled. */
export function SessionList({
  sessions,
  pending,
  onRevoke,
}: {
  sessions: SessionPage;
  pending: boolean;
  onRevoke: (session: SessionItem) => void;
}) {
  const t = useTranslations("auth.settings.sessions");
  return (
    <div className="ui:flex ui:flex-col ui:gap-3">
      <ul aria-label={t("listLabel")} className="ui:flex ui:list-none ui:flex-col ui:divide-y ui:p-0">
        {sessions.items.map((session) => (
          <SessionRow key={session.id} session={session} pending={pending} onRevoke={onRevoke} />
        ))}
      </ul>
      <SessionPagination sessions={sessions} />
    </div>
  );
}
