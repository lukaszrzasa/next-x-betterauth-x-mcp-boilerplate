import "server-only";

import { randomUUID } from "node:crypto";

import { render, toPlainText } from "@react-email/components";
import type { ReactNode } from "react";
import { Resend } from "resend";

import {
  currentOperationContext,
  providerRequestContext,
  type AuthedCtx,
  type PublicCtx,
} from "@/src/lib/auth/builders/context";
import { clipText } from "@/app/(LogsModule)/_/derivation";
import { beginEmailLog } from "@/app/(LogsModule)/_/operations/email/beginEmailLog";
import { completeEmailLog } from "@/app/(LogsModule)/_/operations/email/completeEmailLog";
import { serializeErrorForLog } from "@/app/(LogsModule)/_/redaction";
import { LOG_LIMITS } from "@/app/(LogsModule)/_/schema";
import { LogRecordingError, type EmailCompletionStatus } from "@/app/(LogsModule)/_/types";
import type { Locale } from "@/src/lib/i18n/locales";

/**
 * The one way the application sends email, and therefore the one place
 * every message is logged: an `email_log` attempt is begun before the
 * provider is called and completed with what the provider answered.
 *
 * - `accepted`: the provider took the message (not: it reached an inbox).
 * - `failed`: the provider answered with a refusal, or nothing was sent.
 * - `unknown`: no answer came back (network failure, timeout) - it may or
 *   may not have been accepted, and the log says exactly that.
 *
 * The requester is the operation this runs in (an admin asking for a
 * verification email, a user changing their address); a message Better Auth
 * sends from its own endpoints (sign-up, forgot password, the sign-in code)
 * has no operation and is requested anonymously. The caller declares every
 * secret the message carries; links are removed from the log regardless.
 *
 * Logging never decides delivery: a failure to write the log is reported on
 * the context's log and the message is still sent (an unlogged email is
 * better than a user who never gets their code); a delivery failure still
 * throws to the caller, whose flow already handles it.
 */

export type EmailPurpose =
  | "verification"
  | "password-reset"
  | "two-factor-code"
  | "email-change-current"
  | "email-change-new";

export type OutgoingEmail = {
  purpose: EmailPurpose;
  to: string;
  /** The account the message is about, when there is one. */
  recipient?: { userId: string; name?: string | null };
  /** The language the subject and body were written in (`emailLocale`). */
  locale: Locale;
  subject: string;
  react: ReactNode;
  /** Every sensitive value in the message, by what it is (`token`, `url`, `code`). */
  secrets: Readonly<Record<string, string>>;
  /** Request headers of a provider callback, for the anonymous requester's metadata. */
  providerRequest?: Headers | null;
};

export class EmailDeliveryError extends Error {
  readonly status: Exclude<EmailCompletionStatus, "accepted">;

  constructor(purpose: EmailPurpose, status: Exclude<EmailCompletionStatus, "accepted">, detail: string) {
    // Never the subject: a sign-in code is in it.
    super(`Email (${purpose}) was not sent: ${detail}`);
    this.name = "EmailDeliveryError";
    this.status = status;
  }
}

const PROVIDER = "resend";

let client: Resend | undefined;

/**
 * Lazily constructed: `new Resend()` throws when RESEND_API_KEY is missing, and
 * doing that at import time would break builds on machines without the key.
 */
function resend(): Resend {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not set");
    client = new Resend(apiKey);
  }
  return client;
}

/**
 * Verified sending domain, e.g. "Boilerplate <no-reply@example.com>".
 * `onboarding@resend.dev` is Resend's shared sandbox sender: it only delivers to
 * the email address that owns the Resend account, so it is dev-only.
 */
const from = () => process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

type Observation = {
  status: EmailCompletionStatus;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  stackTrace?: string;
};

export async function sendEmail(email: OutgoingEmail): Promise<{ id: string }> {
  const ctx = currentOperationContext() ?? providerRequestContext(`email.${email.purpose}`, email.providerRequest);
  // Rendered once: the same HTML is sent, and its plain-text form is both
  // the message's text part and what the log keeps.
  const html = await render(email.react);
  const text = toPlainText(html);

  const logId = await begin(ctx, email, text);
  const observation = await deliver(email, html, text);
  if (logId) await complete(ctx, email, logId, observation);

  if (observation.status !== "accepted" || !observation.providerMessageId) {
    throw new EmailDeliveryError(
      email.purpose,
      observation.status === "accepted" ? "unknown" : observation.status,
      observation.errorMessage ?? observation.errorCode ?? "no message ID returned",
    );
  }
  return { id: observation.providerMessageId };
}

async function deliver(email: OutgoingEmail, html: string, text: string): Promise<Observation> {
  let provider: Resend;
  try {
    provider = resend();
  } catch (error) {
    // Nothing left the application: a definite failure.
    return { status: "failed", errorCode: "configuration", ...serializeErrorForLog(error, email.secrets) };
  }

  try {
    const { data, error } = await provider.emails.send({ from: from(), to: email.to, subject: email.subject, html, text });
    if (error) {
      // No HTTP status means no answer: the request may have been accepted.
      return {
        status: error.statusCode === null ? "unknown" : "failed",
        errorCode: error.name,
        errorMessage: error.message,
      };
    }
    return data?.id ? { status: "accepted", providerMessageId: data.id } : { status: "unknown", errorCode: "no_message_id" };
  } catch (error) {
    // The SDK answers errors rather than throwing them; a throw is an
    // unexpected transport fault, after which acceptance is unknown.
    return { status: "unknown", errorCode: "transport", ...serializeErrorForLog(error, email.secrets) };
  }
}

async function begin(ctx: AuthedCtx | PublicCtx, email: OutgoingEmail, text: string): Promise<string | null> {
  // A display snapshot: a name that cannot be a label is left out, never a reason to lose the log.
  const label = clipText((email.recipient?.name ?? "").replace(/[\u0000-\u001F\u007F]+/g, " ").trim(), LOG_LIMITS.labelLength);
  try {
    const { id } = await beginEmailLog(ctx, {
      recordKey: `email:${randomUUID()}`,
      recipientEmail: email.to,
      ...(email.recipient ? { recipientUserId: email.recipient.userId } : {}),
      ...(label ? { recipientLabel: label } : {}),
      subject: email.subject,
      contentText: text,
      provider: PROVIDER,
      secrets: email.secrets,
    });
    return id;
  } catch (error) {
    ctx.log.error("email log not started", { purpose: email.purpose, code: LogRecordingError.from(error).code });
    return null;
  }
}

async function complete(
  ctx: AuthedCtx | PublicCtx,
  email: OutgoingEmail,
  id: string,
  observation: Observation,
): Promise<void> {
  try {
    await completeEmailLog(ctx, {
      id,
      status: observation.status,
      ...(observation.providerMessageId ? { providerMessageId: observation.providerMessageId } : {}),
      ...(observation.errorCode ? { errorCode: observation.errorCode } : {}),
      ...(observation.errorMessage ? { errorMessage: observation.errorMessage } : {}),
      ...(observation.stackTrace ? { stackTrace: observation.stackTrace } : {}),
      secrets: email.secrets,
    });
  } catch (error) {
    // The attempt stays `sending`, which the dialog shows as "no completion recorded".
    ctx.log.error("email log not completed", { purpose: email.purpose, code: LogRecordingError.from(error).code });
  }
}
