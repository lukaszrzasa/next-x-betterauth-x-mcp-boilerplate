import type { StepUpMethod, RequiredStepUp } from "./2fa";

/**
 * Every way an action can refuse, with the HTTP status a surface that has one
 * should use. 428 for the two-factor cases because the request is well-formed
 * and authorised - it is a precondition that is missing, and the client is
 * expected to satisfy it and retry.
 */
export const ACTION_ERROR_STATUS = {
  INVALID_INPUT: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  EMAIL_VERIFICATION_REQUIRED: 403,
  IMPERSONATION_FORBIDDEN: 403,
  TWO_FACTOR_REQUIRED: 428,
  TWO_FACTOR_ENROLLMENT_REQUIRED: 428,
  STEP_UP_INVALID_CODE: 401,
  STEP_UP_LOCKED: 429,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const;

export type ActionErrorReason = keyof typeof ACTION_ERROR_STATUS;

/** Reasons that represent a refusal rather than a crash. */
export type DenialReason = Exclude<ActionErrorReason, "INTERNAL">;

/**
 * Payload attached to `TWO_FACTOR_REQUIRED`. The client needs both halves: the
 * verification policy, and the methods this user can actually use, so
 * the modal knows whether to ask for an authenticator code or email one.
 */
export type TwoFactorRequiredData = {
  policy: RequiredStepUp;
  methods: readonly StepUpMethod[];
};

/**
 * Thrown by the action core and by db-services. Surfaces that carry a status
 * line render it as a real 4xx; the server-action adapter converts it to a
 * result object, because Next replaces a thrown error's message with an opaque
 * digest in production and the payload above would not survive the trip.
 */
export class ActionError extends Error {
  readonly reason: ActionErrorReason;
  readonly status: number;
  readonly data: unknown;

  constructor(
    reason: ActionErrorReason,
    options: { message?: string; data?: unknown; cause?: unknown } = {},
  ) {
    super(options.message ?? reason, { cause: options.cause });
    this.name = "ActionError";
    this.reason = reason;
    this.status = ACTION_ERROR_STATUS[reason];
    this.data = options.data;
  }

  static is(value: unknown): value is ActionError {
    return value instanceof ActionError;
  }

  static twoFactorRequired(data: TwoFactorRequiredData) {
    return new ActionError("TWO_FACTOR_REQUIRED", {
      message: `Step-up verification required (${data.policy})`,
      data,
    });
  }
}
