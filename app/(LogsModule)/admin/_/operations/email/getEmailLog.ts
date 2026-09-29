import "server-only";

import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { ActionError } from "@/src/lib/auth/errors";
import { findEmailLogWithAttempts } from "@/app/(LogsModule)/admin/_/db/email/detail";
import { EMAIL_ATTEMPTS_PAGE_SIZE, emailLogDetailSchema } from "@/app/(LogsModule)/admin/_/schema";
import type { EmailLogDetail } from "@/app/(LogsModule)/admin/_/types";
import { toAttemptItem, toDetail } from "./projection";

/**
 * The record behind the dialog, with a page of its attempt chain. Exposed
 * as a Server Action, which a browser can call directly, so it is
 * admin-only on its own. Not MCP-eligible, no step-up.
 *
 * A status is shown as recorded: `accepted` is the provider's acceptance,
 * not delivery, and an attempt left in `sending` is not turned into
 * `unknown` or `failed` here.
 */
export const getEmailLogOperation = defineAction({
  name: "logs.email.get",
  schema: emailLogDetailSchema,
  roles: ["admin"],
  mcpAllowed: false,
  stepUp: "none",
  handler: async (ctx, input): Promise<EmailLogDetail> => {
    const found = await findEmailLogWithAttempts(ctx, {
      id: input.id,
      attemptsPage: input.attemptsPage,
      attemptsPageSize: EMAIL_ATTEMPTS_PAGE_SIZE,
    });
    // A record that does not exist, and one hidden from the caller, are the same answer.
    if (!found) throw new ActionError("NOT_FOUND", { message: "This log is not available." });

    return {
      ...toDetail(found.row),
      attempts: {
        items: found.attempts.rows.map(toAttemptItem),
        page: found.attempts.page,
        pageSize: EMAIL_ATTEMPTS_PAGE_SIZE,
        total: found.attempts.total,
      },
    };
  },
});
