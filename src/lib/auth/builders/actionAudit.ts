import type { DenialReason } from "@/src/lib/auth/errors";
import { errorMessage } from "@/src/lib/errorMessage";
import type { AuthedCtx, Logger } from "./context";

export type AuditEvent<TInput, TOutput> =
  | { outcome: "success"; input: TInput; output: TOutput }
  | { outcome: "denied"; input: TInput | null; reason: DenialReason }
  | { outcome: "failed"; input: TInput };

/** Bound to the correctly typed context in the public/session branch. */
export type AuditDescription<TInput, TOutput> = (
  event: AuditEvent<TInput, TOutput>,
) => string | Promise<string>;

export async function writeAudit<TInput, TOutput>(
  describe: AuditDescription<TInput, TOutput> | undefined,
  log: Logger,
  event: AuditEvent<TInput, TOutput>,
): Promise<void> {
  if (!describe) return;

  try {
    const message = await describe(event);
    log.info("audit", { outcome: event.outcome, message });
  } catch (error) {
    // An optional description cannot fail an action that already succeeded.
    log.error("audit hook threw", {
      error: errorMessage(error),
    });
  }
}

/**
 * A ready-made `auditLog` hook for operations that act on one target: it
 * names the actor, the target and the outcome, and nothing else from the
 * input. `target` reads the target's identifier from the parsed input;
 * `result` summarizes a successful output (its status, say).
 */
export function describeTargetedAudit<TInput, TOutput>({
  target,
  result,
}: {
  target: (input: TInput) => string;
  result: (output: TOutput) => string;
}): (ctx: AuthedCtx, event: AuditEvent<TInput, TOutput>) => string {
  return (ctx, event) => {
    const subject = event.input === null ? "unknown" : target(event.input);
    const prefix = `${ctx.user.id} -> ${subject}`;
    switch (event.outcome) {
      case "success":
        return `${prefix}: ${result(event.output)}`;
      case "denied":
        return `${prefix}: denied (${event.reason})`;
      case "failed":
        return `${prefix}: failed`;
    }
  };
}
