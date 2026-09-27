import "server-only";

import { and, eq } from "drizzle-orm";

import type { AuthedCtx } from "@/src/lib/auth/builders/context";
import { db, emailChangeRequest } from "@/src/lib/db";
import type { EmailChangePurpose } from "@/src/lib/email";
import { isCoolingDown } from "@/src/lib/throttle";
import { withUserAccountLock } from "@/app/(AuthModule)/_/db/userAccountLock";
import { lifecycleError, rateLimitedError } from "@/app/(AuthModule)/_/db/settings/shared/errors";
import { settingsThrottleKeys } from "@/app/(AuthModule)/_/db/settings/shared/throttleKeys";
import type { EmailRequestTargetSchema } from "@/app/(AuthModule)/_/schemas/settings";
import type { EmailRequestOutcome } from "@/app/(AuthModule)/_/types/settings";
import { deliverLink } from "./delivery";
import { inactiveRequestError } from "./errors";
import { pendingOutcome } from "./projection";
import { requireOwnedRequest, type EmailChangeRequestRow } from "./requests";
import { issueToken } from "./tokens";

type Stage = { purpose: EmailChangePurpose; to: string };

/** Which confirmation email a resend would send at the request's current step, or `null` when none is due. */
function resendStage(request: EmailChangeRequestRow): Stage | null {
  if (request.state === "awaiting_current") return { purpose: "current", to: request.originalEmail };
  if (request.state === "awaiting_new" && request.newEmail) return { purpose: "new", to: request.newEmail };
  return null;
}

/** Rotating a stage's token supersedes the link sent before it. */
function rotatedToken(request: EmailChangeRequestRow, purpose: EmailChangePurpose, hash: string) {
  if (purpose === "current") {
    return { currentTokenHash: hash, currentTokenGeneration: request.currentTokenGeneration + 1 };
  }
  return { newTokenHash: hash, newTokenGeneration: request.newTokenGeneration + 1 };
}

/** A fresh link for the stage still awaiting mail; the deadline never moves. */
export async function resendEmailRequest(
  ctx: AuthedCtx,
  input: EmailRequestTargetSchema,
): Promise<EmailRequestOutcome> {
  const { token, hash } = issueToken();
  const { row, stage } = await withUserAccountLock(ctx, ctx.user.id, async (reads) => {
    const request = await requireOwnedRequest(reads, ctx.user.id, input.requestId, new Date());
    const stage = resendStage(request);
    if (!stage) throw lifecycleError("CONFLICT", "INACTIVE", "There is no email to resend at this step.");
    // The cooldown is checked read-only first so a blocked resend rotates nothing.
    const cooling = await isCoolingDown(settingsThrottleKeys.emailSendCooldown(ctx.user.id, stage.purpose));
    if (!cooling.allowed) {
      throw rateLimitedError(cooling.retryAfterSeconds, "Wait a minute before requesting another link.");
    }
    const [updated] = await db
      .update(emailChangeRequest)
      .set(rotatedToken(request, stage.purpose, hash))
      .where(and(eq(emailChangeRequest.id, request.id), eq(emailChangeRequest.state, request.state)))
      .returning();
    if (!updated) throw inactiveRequestError();
    return { row: updated, stage };
  });

  const delivery = await deliverLink(ctx, { ...stage, token, expiresAt: row.expiresAt });
  return pendingOutcome(row, delivery);
}
