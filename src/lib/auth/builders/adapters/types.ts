import type { ActionErrorReason } from "@/src/lib/auth/errors";
import type { StepUpProof } from "@/src/lib/auth/stepUpPolicy";

export type ClientActionMeta = { stepUp?: StepUpProof };

/**
 * Next.js redacts thrown server errors in production, replacing their details
 * with a digest. Return expected refusals as data so the client retains the
 * TWO_FACTOR_REQUIRED policy/methods payload needed to show its step-up prompt.
 */
export type ActionResult<TOutput> =
  | {
      ok: true;
      data: TOutput;
    }
  | {
      ok: false;
      reason: ActionErrorReason;
      status: number;
      message: string;
      data?: unknown;
    };

export type ServerAction<TInput, TOutput> = (
  input: TInput,
  meta?: ClientActionMeta,
) => Promise<ActionResult<TOutput>>;
