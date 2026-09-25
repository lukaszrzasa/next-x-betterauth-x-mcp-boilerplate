import type {
  ActionResult,
  ServerAction,
} from "@/src/lib/auth/builders/adapters";
import type { TwoFactorRequiredData } from "@/src/lib/auth/errors";
import type { StepUpProof } from "@/src/lib/auth/stepUpPolicy";

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
