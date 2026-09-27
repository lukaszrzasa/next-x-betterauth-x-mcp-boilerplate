"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { LogOutIcon } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { formatUtcDateTime, toIsoInstant } from "@/src/lib/date/format";
import { withQuery } from "@/src/lib/routes";
import { describeUserAgent } from "@/src/lib/userAgent";
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
  return (
    <li className="ui:flex ui:flex-col ui:gap-2 ui:py-3 ui:first:pt-0 ui:sm:flex-row ui:sm:items-start ui:sm:justify-between ui:sm:gap-6">
      <div className="ui:min-w-0 ui:text-sm">
        <p className="ui:flex ui:flex-wrap ui:items-center ui:gap-2 ui:font-medium">
          {describeUserAgent(session.userAgent)}
          {session.isCurrent && <Badge variant="secondary">This device</Badge>}
        </p>
        <p className="ui:text-muted-foreground">
          Signed in <time dateTime={toIsoInstant(session.createdAt)}>{formatUtcDateTime(session.createdAt)}</time>
          {" · "}IP {session.ipAddress ?? "unknown"}
        </p>
        {session.userAgent && (
          <details className="ui:mt-1 ui:text-xs ui:text-muted-foreground">
            <summary className="ui:cursor-pointer">Details</summary>
            <p className="ui:mt-1 ui:break-all">{session.userAgent}</p>
            <p>Expires {formatUtcDateTime(session.expiresAt)}</p>
          </details>
        )}
      </div>
      {!session.isCurrent && (
        <div className="ui:shrink-0">
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => onRevoke(session)}>
            <LogOutIcon aria-hidden="true" />
            Sign out
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
  const lastPage = Math.max(1, Math.ceil(sessions.total / sessions.pageSize));
  const paged = lastPage > 1;

  return (
    <div className="ui:flex ui:flex-wrap ui:items-center ui:justify-between ui:gap-2 ui:text-sm ui:text-muted-foreground">
      <p>
        {sessions.total} active {sessions.total === 1 ? "session" : "sessions"}
        {paged && ` · page ${sessions.page} of ${lastPage}`}
      </p>
      {paged && (
        <nav aria-label="Session pages" className="ui:flex ui:gap-2">
          <PageLink page={sessions.page - 1} enabled={sessions.page > 1}>
            Previous
          </PageLink>
          <PageLink page={sessions.page + 1} enabled={sessions.page < lastPage}>
            Next
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
  return (
    <div className="ui:flex ui:flex-col ui:gap-3">
      <ul aria-label="Sessions" className="ui:flex ui:list-none ui:flex-col ui:divide-y ui:p-0">
        {sessions.items.map((session) => (
          <SessionRow key={session.id} session={session} pending={pending} onRevoke={onRevoke} />
        ))}
      </ul>
      <SessionPagination sessions={sessions} />
    </div>
  );
}
