import type { SecurityStateChangedData } from "@/src/lib/auth/securityVersion";

/**
 * What crosses the server/client boundary for the account settings pages.
 * Every shape is an explicit projection: an auth row, a request row or a
 * provider response is never returned or spread, so password hashes, session
 * tokens, factor secrets, token digests and the reset cutoff cannot leak by
 * accident. Timestamps travel as ISO 8601 UTC strings. QR/manual setup
 * material and freshly issued recovery codes are the only sensitive outputs,
 * and only ever as the result of the action that produced them.
 */

export type ProfileSettings = { name: string };

export const SESSION_PAGE_SIZE = 20;

export type PendingEmailRequest =
  | { state: "none" }
  | {
      state: "awaiting_current";
      id: string;
      kind: "change";
      originalEmail: string;
      expiresAt: string;
      /** When the current-mailbox link may be resent, or `null` when it may be resent now. */
      resendAfter: string | null;
    }
  | { state: "awaiting_new_address"; id: string; kind: "change"; originalEmail: string; expiresAt: string }
  | {
      state: "awaiting_new";
      id: string;
      kind: "change" | "correction";
      originalEmail: string;
      newEmail: string;
      expiresAt: string;
      resendAfter: string | null;
    };

export type AccountSettings = {
  email: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  /** Computed from both the staff role and the stored policy; presentation only, every write rechecks. */
  twoFactorRequired: boolean;
  pendingEmail: PendingEmailRequest;
};

/** Follow-up effects an operation performs after its committed write. */
export type SettingsEffect = "session-refresh" | "session-renewal" | "session-revocation";

export type SyncOutcome =
  | { status: "unchanged" }
  | { status: "completed"; selfSignedOut?: boolean }
  | { status: "partial"; committed: boolean; failedEffects: SettingsEffect[] };

export type EmailDelivery = "sent" | "not-required" | "failed" | "rate-limited";

export type EmailRequestOutcome = {
  status: "pending";
  request: Exclude<PendingEmailRequest, { state: "none" }>;
  delivery: EmailDelivery;
  retryAfterSeconds?: number;
};

/** Cancelling a request or a setup attempt: nothing to undo is not an error. */
export type CancelOutcome = { status: "completed" | "unchanged" };

export type EmailProofOutcome =
  | { status: "current-confirmed" }
  | { status: "completed"; sessionRevocationPending: boolean }
  | { status: "inactive" | "expired" | "destination-unavailable" | "account-changed" };

/** What the public confirmation page may show before the explicit submit. */
export type EmailProofInspection =
  | { status: "confirmable"; purpose: "current" | "new"; maskedEmail: string; expiresAt: string }
  | { status: "inactive" | "expired" };

export type SetupStarted = {
  status: "pending";
  requestId: string;
  kind: "enroll" | "replace";
  expiresAt: string;
  /** Sensitive: shown in the active setup flow only, never stored client-side or logged. */
  totpUri: string;
  manualKey: string;
};

export type RecoveryCodesIssued =
  | {
      status: "completed" | "partial";
      /** Sensitive: presented once by the flow that received them. */
      recoveryCodes: string[];
      issuedAt: string;
      failedEffects: Array<"session-refresh">;
    }
  | { status: "completed-codes-unavailable"; action: "regenerate-recovery-codes" };

export type SessionItem = {
  id: string;
  isCurrent: boolean;
  createdAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export type SessionPage = {
  items: SessionItem[];
  page: number;
  pageSize: typeof SESSION_PAGE_SIZE;
  total: number;
};

/**
 * Closed lifecycle refusals, carried as `ActionError.data.code` on a
 * `CONFLICT` (or `NOT_FOUND` for `INACTIVE`), so no caller has to infer a
 * workflow state from a provider's exception text.
 */
export type SettingsLifecycleCode =
  | "EXPIRED"
  | "INACTIVE"
  | "DESTINATION_UNAVAILABLE"
  | SecurityStateChangedData["code"]
  | "SETUP_REPLACED";

export type SettingsLifecycleData = { code: SettingsLifecycleCode; retryable?: boolean };

/** `ActionError.data` for refusals a settings form can attribute to one field. */
export type SettingsFieldError = {
  field: "currentPassword" | "newPassword" | "newEmail" | "authenticatorCode" | "code" | "name";
  code: string;
};

/** `ActionError.data` for `RATE_LIMITED` refusals. */
export type SettingsRateLimitedData = { retryAfterSeconds: number };
