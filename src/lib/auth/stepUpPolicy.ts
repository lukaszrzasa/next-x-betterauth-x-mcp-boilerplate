/**
 * Step-up vocabulary shared by the server (builder, verification) and the
 * client (verification modal). Everything here is isomorphic: no imports.
 */

/** One reusable, session-bound step-up window. Reuse never extends it. */
export const STEP_UP_WINDOW_SECONDS = 5 * 60;

/** Shared with Better Auth so replay protection covers its acceptance window. */
export const TOTP_PERIOD_SECONDS = 30;

export const STEP_UP_POLICIES = ["none", "five_minutes", "every_time"] as const;
export type StepUpPolicy = (typeof STEP_UP_POLICIES)[number];

/** Policies that actually prompt for a second factor. */
export const REQUIRED_STEP_UPS = ["five_minutes", "every_time"] as const satisfies readonly StepUpPolicy[];
export type RequiredStepUp = (typeof REQUIRED_STEP_UPS)[number];

export const STEP_UP_METHODS = ["totp", "email"] as const;
export type StepUpMethod = (typeof STEP_UP_METHODS)[number];

/** Every second-factor code in the app is six digits: authenticator, email, step-up. */
export const CODE_PATTERN = /^\d{6}$/;
export const CODE_LENGTH = 6;

/** What a client submits to satisfy a step-up challenge. */
export type StepUpProof = {
  method: StepUpMethod;
  code: string;
};
