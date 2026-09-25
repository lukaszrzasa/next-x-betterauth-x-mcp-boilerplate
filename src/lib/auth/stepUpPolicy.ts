/** One reusable, session-bound step-up window. Reuse never extends it. */
export const STEP_UP_WINDOW_SECONDS = 5 * 60;
export type StepUpPolicy = "none" | "five_minutes" | "every_time";
export type RequiredStepUp = Exclude<StepUpPolicy, "none">;
export type StepUpMethod = "totp" | "email";
/** Shared with Better Auth so replay protection covers its acceptance window. */
export const TOTP_PERIOD_SECONDS = 30;
