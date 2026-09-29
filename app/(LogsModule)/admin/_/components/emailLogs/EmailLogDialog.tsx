"use client";

import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { CopyButton } from "@/src/components/actions/CopyButton";
import { Button } from "@/src/components/ui/button";
import { useNowSeconds } from "@/src/lib/hooks/useNow";
import { lastPage } from "@/src/lib/data-table/queryState";
import { emailLogMatchesCriteria } from "@/app/(LogsModule)/admin/_/queryState";
import type { EmailLogDetail, EmailLogsQuery, ResolvedRange } from "@/app/(LogsModule)/admin/_/types";
import { useEmailLogDetails } from "@/app/(LogsModule)/admin/_/hooks/useEmailLogDetails";
import {
  DetailField,
  DetailFields,
  DialogSection,
  Identifier,
} from "@/app/(LogsModule)/admin/_/components/shared/DetailFields";
import { ActorLabel, EntityLabel } from "@/app/(LogsModule)/admin/_/components/shared/EntityLabel";
import {
  LogDialogFrame,
  LogDialogLoading,
  LogDialogMessage,
  OutsideCriteriaNote,
} from "@/app/(LogsModule)/admin/_/components/shared/LogDialogFrame";
import { LogTime } from "@/app/(LogsModule)/admin/_/components/shared/LogTime";
import { StackTrace } from "@/app/(LogsModule)/admin/_/components/shared/StackTrace";
import { EmailStatusBadge } from "./EmailStatusBadge";

/** A `sending` attempt older than this is shown as having no recorded completion; it is never converted. */
export const SENDING_UNRESOLVED_AFTER_SECONDS = 15 * 60;

type SelectionState = {
  /** Increases with every (record, attempts page) request; keys the loader. */
  generation: number;
  id: string | null;
  attemptsPage: number;
  /** The last loaded detail, kept only for the same record while another attempts page loads. */
  retained: EmailLogDetail | null;
};

export type EmailLogDialogProps = {
  selectedId: string | null;
  /** The list's criteria, to tell whether the record is outside them. */
  list: { query: EmailLogsQuery; range: ResolvedRange };
  hrefFor: (id: string) => string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
};

/**
 * The email-log dialog over its list. It is open exactly while the URL
 * selects a record. Each (record, attempts page) pair loads in its own keyed
 * lifetime with a monotonically increasing generation, so a slow response
 * for an earlier selection can neither render nor be retained. Attempt
 * pagination is dialog-local and restarts at page 1 for every selection.
 */
export function EmailLogDialog({ selectedId, list, hrefFor, onSelect, onClose, onCloseAutoFocus }: EmailLogDialogProps) {
  const [state, setState] = useState<SelectionState>({ generation: 0, id: selectedId, attemptsPage: 1, retained: null });
  if (state.id !== selectedId) {
    setState({ generation: state.generation + 1, id: selectedId, attemptsPage: 1, retained: null });
  }

  const { generation } = state;
  const retained = state.retained?.id === selectedId ? state.retained : null;

  // Stable per generation, and applied only while that generation is current.
  const onLoaded = useCallback(
    (detail: EmailLogDetail) =>
      setState((current) => (current.generation === generation ? { ...current, retained: detail } : current)),
    [generation],
  );
  // A record that became unavailable or refused keeps nothing of its earlier pages.
  const onDiscard = useCallback(
    () => setState((current) => (current.generation === generation ? { ...current, retained: null } : current)),
    [generation],
  );
  const onAttemptsPage = useCallback(
    (attemptsPage: number) =>
      setState((current) => ({ ...current, generation: current.generation + 1, attemptsPage })),
    [],
  );

  return (
    <LogDialogFrame
      open={selectedId !== null}
      title="Email attempt"
      description="One sending attempt as recorded: metadata, redacted content, its retry chain and diagnostics."
      onClose={onClose}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      {selectedId !== null && (
        <EmailLogDetailBody
          key={generation}
          id={selectedId}
          attemptsPage={state.attemptsPage}
          placeholder={retained}
          list={list}
          hrefFor={hrefFor}
          onSelect={onSelect}
          onAttemptsPage={onAttemptsPage}
          onLoaded={onLoaded}
          onDiscard={onDiscard}
        />
      )}
    </LogDialogFrame>
  );
}

function EmailLogDetailBody({
  id,
  attemptsPage,
  placeholder,
  list,
  hrefFor,
  onSelect,
  onAttemptsPage,
  onLoaded,
  onDiscard,
}: {
  id: string;
  attemptsPage: number;
  placeholder: EmailLogDetail | null;
  list: EmailLogDialogProps["list"];
  hrefFor: (id: string) => string;
  onSelect: (id: string) => void;
  onAttemptsPage: (page: number) => void;
  onLoaded: (detail: EmailLogDetail) => void;
  onDiscard: () => void;
}) {
  const result = useEmailLogDetails(id, attemptsPage);

  useEffect(() => {
    if (result.status === "loaded") onLoaded(result.detail);
    if (result.status === "refused" || result.status === "unavailable") onDiscard();
  }, [result, onLoaded, onDiscard]);

  switch (result.status) {
    case "unavailable":
      return (
        <LogDialogMessage
          title="This log is not available"
          message="It does not exist, or you can no longer view it."
        />
      );
    case "refused":
      return (
        <LogDialogMessage
          title="You can no longer view this log"
          message="Your session or access changed. Sign in again, or ask an administrator."
        />
      );
    case "failed":
      return (
        <LogDialogMessage
          title="The log could not be loaded"
          message="Nothing was changed. Try again in a moment."
          action={
            <Button type="button" variant="outline" size="sm" onClick={result.retry}>
              Retry
            </Button>
          }
        />
      );
    case "loaded":
    case "loading": {
      const detail = result.status === "loaded" ? result.detail : placeholder;
      if (!detail) return <LogDialogLoading label="Loading email log" />;
      return (
        <EmailLogDetailView
          detail={detail}
          attemptsLoading={result.status === "loading"}
          outside={!emailLogMatchesCriteria(detail, list)}
          hrefFor={hrefFor}
          onSelect={onSelect}
          onAttemptsPage={onAttemptsPage}
        />
      );
    }
  }
}

function EmailLogDetailView({
  detail,
  attemptsLoading,
  outside,
  hrefFor,
  onSelect,
  onAttemptsPage,
}: {
  detail: EmailLogDetail;
  attemptsLoading: boolean;
  outside: boolean;
  hrefFor: (id: string) => string;
  onSelect: (id: string) => void;
  onAttemptsPage: (page: number) => void;
}) {
  const now = useNowSeconds();
  const unresolved =
    detail.status === "sending" &&
    now !== null &&
    now - new Date(detail.startedAt).getTime() / 1000 > SENDING_UNRESOLVED_AFTER_SECONDS;
  const diagnostics = detail.errorCode !== null || detail.errorMessage !== null || detail.stackTrace !== null;

  return (
    <div className="ui:flex ui:flex-col ui:gap-6">
      {outside && <OutsideCriteriaNote />}
      {unresolved && (
        <p className="ui:rounded-md ui:border ui:px-3 ui:py-2 ui:text-sm">
          <span className="ui:font-medium">No completion recorded.</span> This attempt started more than 15 minutes
          ago and its outcome was never recorded. It stays listed as sending.
        </p>
      )}

      <DialogSection title="Metadata">
        <DetailFields>
          <DetailField label="Started">
            <LogTime value={detail.startedAt} />
          </DetailField>
          <DetailField label="Completed">
            {detail.completedAt ? (
              <LogTime value={detail.completedAt} />
            ) : (
              <span className="ui:text-muted-foreground">
                {unresolved ? "No completion recorded" : "Not completed yet"}
              </span>
            )}
          </DetailField>
          <DetailField label="Recipient">
            <span className="ui:flex ui:flex-col">
              {detail.recipientUserId ? (
                <EntityLabel
                  entity={{ type: "user", id: detail.recipientUserId, label: detail.recipientLabel ?? detail.recipientEmail }}
                />
              ) : (
                <span>{detail.recipientLabel ?? detail.recipientEmail}</span>
              )}
              {detail.recipientLabel && <span className="ui:text-muted-foreground">{detail.recipientEmail}</span>}
            </span>
          </DetailField>
          <DetailField label="Status">
            <span className="ui:flex ui:flex-col ui:items-start ui:gap-1">
              <EmailStatusBadge status={detail.status} />
              {detail.status === "accepted" && (
                <span className="ui:text-xs ui:text-muted-foreground">
                  Accepted by the provider. Delivery to the inbox is not tracked.
                </span>
              )}
            </span>
          </DetailField>
          <DetailField label="Subject" wide>
            <span className="ui:whitespace-pre-wrap">{detail.subject}</span>
          </DetailField>
          <DetailField label="Provider">{detail.provider ?? <span className="ui:text-muted-foreground">Not recorded</span>}</DetailField>
          <DetailField label="Provider message ID">
            {detail.providerMessageId ? (
              <Identifier value={detail.providerMessageId} />
            ) : (
              <span className="ui:text-muted-foreground">Not recorded</span>
            )}
          </DetailField>
          <DetailField label="Requested by">
            <ActorLabel actor={detail.requester} />
          </DetailField>
          <DetailField label="Request ID">
            <Identifier value={detail.requestId} />
          </DetailField>
          <DetailField label="Log ID">
            <Identifier value={detail.id} />
          </DetailField>
          <DetailField label="Last updated">
            <LogTime value={detail.updatedAt} />
          </DetailField>
        </DetailFields>
      </DialogSection>

      <DialogSection title="Content">
        <div className="ui:flex ui:flex-col ui:gap-2">
          <div className="ui:flex ui:flex-wrap ui:items-center ui:justify-between ui:gap-2">
            <p className="ui:text-xs ui:text-muted-foreground">
              Plain text as recorded. Codes, links and other sensitive values were removed before storage.
            </p>
            <CopyButton value={detail.contentText} label="Copy redacted content">
              Copy redacted content
            </CopyButton>
          </div>
          <pre className="ui:max-h-80 ui:overflow-auto ui:rounded-md ui:border ui:bg-muted ui:p-3 ui:font-sans ui:text-sm ui:break-words ui:whitespace-pre-wrap">
            {detail.contentText}
          </pre>
        </div>
      </DialogSection>

      <AttemptsSection
        detail={detail}
        loading={attemptsLoading}
        hrefFor={hrefFor}
        onSelect={onSelect}
        onAttemptsPage={onAttemptsPage}
      />

      {diagnostics && (
        <DialogSection title="Diagnostics">
          <DetailFields>
            {detail.errorCode !== null && (
              <DetailField label="Error code">
                <Identifier value={detail.errorCode} />
              </DetailField>
            )}
            {detail.errorMessage !== null && (
              <DetailField label="Error message" wide>
                <span className="ui:whitespace-pre-wrap">{detail.errorMessage}</span>
              </DetailField>
            )}
          </DetailFields>
          {detail.stackTrace !== null && <StackTrace value={detail.stackTrace} />}
        </DialogSection>
      )}
    </div>
  );
}

/** Selecting another attempt replaces `log` in the same list URL (a pushed entry). */
function AttemptLink({
  id,
  hrefFor,
  onSelect,
  children,
}: {
  id: string;
  hrefFor: (id: string) => string;
  onSelect: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <a
      href={hrefFor(id)}
      className="ui:font-medium ui:underline ui:underline-offset-4 ui:hover:text-primary"
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        // A modified click opens the shareable URL elsewhere, as a link should.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        onSelect(id);
      }}
    >
      {children}
    </a>
  );
}

const attemptName = (attemptNumber: number) =>
  attemptNumber === 1 ? "Initial attempt" : `Attempt #${attemptNumber}`;

function AttemptsSection({
  detail,
  loading,
  hrefFor,
  onSelect,
  onAttemptsPage,
}: {
  detail: EmailLogDetail;
  loading: boolean;
  hrefFor: (id: string) => string;
  onSelect: (id: string) => void;
  onAttemptsPage: (page: number) => void;
}) {
  const { attempts } = detail;
  const pages = lastPage(attempts.total, attempts.pageSize);
  const first = (attempts.page - 1) * attempts.pageSize + 1;
  const last = Math.min(first + attempts.pageSize - 1, attempts.total);

  return (
    <DialogSection title="Attempts">
      <DetailFields>
        <DetailField label="This attempt">{attemptName(detail.attemptNumber)}</DetailField>
        <DetailField label="Chain">
          {attempts.total === 1 ? "No retries" : `${attempts.total.toLocaleString("en-US")} attempts`}
        </DetailField>
        {detail.originalLogId && (
          <DetailField label="Original attempt">
            <AttemptLink id={detail.originalLogId} hrefFor={hrefFor} onSelect={onSelect}>
              View the initial attempt
            </AttemptLink>
          </DetailField>
        )}
        {detail.previousAttemptId && (
          <DetailField label="Retried attempt">
            <AttemptLink id={detail.previousAttemptId} hrefFor={hrefFor} onSelect={onSelect}>
              View the attempt this one retried
            </AttemptLink>
          </DetailField>
        )}
      </DetailFields>

      <div aria-busy={loading || undefined} className={loading ? "ui:opacity-60 ui:transition-opacity" : undefined}>
        <ol aria-label="Attempts in this chain" className="ui:flex ui:flex-col ui:divide-y ui:rounded-md ui:border">
          {attempts.items.map((attempt) => {
            const current = attempt.id === detail.id;
            return (
              <li
                key={attempt.id}
                aria-current={current ? "true" : undefined}
                className="ui:flex ui:flex-col ui:gap-1 ui:px-3 ui:py-2 ui:text-sm ui:sm:flex-row ui:sm:items-center ui:sm:gap-4"
              >
                <span className="ui:sm:w-36">
                  {current ? (
                    <span className="ui:font-medium">
                      {attemptName(attempt.attemptNumber)} <span className="ui:text-muted-foreground">(shown)</span>
                    </span>
                  ) : (
                    <AttemptLink id={attempt.id} hrefFor={hrefFor} onSelect={onSelect}>
                      {attemptName(attempt.attemptNumber)}
                    </AttemptLink>
                  )}
                </span>
                <LogTime value={attempt.startedAt} className="ui:text-muted-foreground ui:sm:w-48" />
                <EmailStatusBadge status={attempt.status} />
                <span className="ui:min-w-0 ui:truncate">
                  <span className="ui:text-muted-foreground">by </span>
                  <ActorLabel actor={attempt.requester} />
                </span>
              </li>
            );
          })}
        </ol>
        {pages > 1 && (
          <nav aria-label="Attempt pages" className="ui:mt-2 ui:flex ui:items-center ui:justify-between ui:gap-2 ui:text-sm">
            <p role="status" aria-live="polite" className="ui:text-muted-foreground">
              Attempts {first}–{last} of {attempts.total.toLocaleString("en-US")}
            </p>
            <div className="ui:flex ui:gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Previous attempts"
                disabled={loading || attempts.page <= 1}
                onClick={() => onAttemptsPage(attempts.page - 1)}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Next attempts"
                disabled={loading || attempts.page >= pages}
                onClick={() => onAttemptsPage(attempts.page + 1)}
              >
                <ChevronRightIcon />
              </Button>
            </div>
          </nav>
        )}
      </div>
    </DialogSection>
  );
}
