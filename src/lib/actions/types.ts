import type {
  ActionResult,
  ServerAction,
} from "../auth/builders/adapters/types";
import type { TwoFactorRequiredData } from "../auth/errors";
import type { StepUpProof } from "../auth/stepUp";

export type { ServerAction };
export type ActionFailure =
  | Exclude<ActionResult<never>, { ok: true }>
  | {
      ok: false;
      reason: "TRANSPORT";
      status: 0;
      message: string;
    };

export type ActionOutcome<T> =
  | { status: "success"; data: T }
  | { status: "error"; error: ActionFailure }
  | { status: "cancelled" }
  | { status: "busy" };

/** Return true to suppress the shared error handler. */
export type ErrorHandler = (error: ActionFailure) => boolean | void;
export type ActionOptions<T> = {
  onSuccess?: (data: T) => void;
  onError?: ErrorHandler;
};

export type VerificationRequest = {
  challenge: TwoFactorRequiredData;
  signal: AbortSignal;
  /** null means a terminal result; only incorrect codes keep verification open. */
  submit: (proof: StepUpProof) => Promise<ActionFailure | null>;
  sendEmail: () => Promise<ActionFailure | null>;
};

export type VerificationPresenter = (
  request: VerificationRequest,
) => Promise<"finished" | "cancelled">;
