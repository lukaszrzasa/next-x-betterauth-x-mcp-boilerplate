import type { DenialReason } from "../errors";
import type { Logger } from "./context";

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
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
