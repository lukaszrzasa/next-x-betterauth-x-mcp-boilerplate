import { z } from "zod";
import { CODE_PATTERN } from "@/src/lib/auth/stepUpPolicy";

// ---------------------------------------------------------------------------
// Field schemas
//
// Shared by the authentication forms and the settings forms/operations
// (`schemas/settings.ts`), so there is exactly one password policy, one
// email normalization and one display-name rule in the module.
// ---------------------------------------------------------------------------

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

/** Trimmed and lowercased before the format check; at most 254 characters. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "auth.validation.maxLength")
  .pipe(z.email("auth.validation.email"))
  .prefault("");

/** A display name: trimmed, 1-100 characters, any script, no control characters. */
export const nameSchema = z
  .string()
  .trim()
  .min(1, "auth.validation.nameRequired")
  .max(100, "auth.validation.maxLength")
  .refine((value) => !CONTROL_CHARACTERS.test(value), "auth.validation.nameControlCharacters")
  .prefault("");

/** A password being set: enforces the password policy. Never trimmed. */
export const newPasswordSchema = z
  .string()
  .min(8, "auth.validation.minLength")
  .max(128, "auth.validation.maxLength")
  .prefault("");

/** A password being confirmed: the server compares the hash, so only "not empty" applies. Never trimmed. */
export const currentPasswordSchema = z
  .string()
  .min(1, "auth.validation.passwordRequired")
  .max(128, "auth.validation.maxLength")
  .prefault("");

export const authenticatorCodeSchema = z
  .string()
  .regex(CODE_PATTERN, "auth.validation.authenticatorCode")
  .prefault("");

const emailCodeSchema = z
  .string()
  .regex(CODE_PATTERN, "auth.validation.emailCode")
  .prefault("");

const recoveryCodeSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/,
    "auth.validation.recoveryCode",
  )
  .prefault("");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const newPasswordFields = {
  password: newPasswordSchema,
  confirmPassword: z.string().prefault(""),
};

function passwordsMatch(input: { password: string; confirmPassword: string }) {
  return input.password === input.confirmPassword;
}

const passwordMismatchError = {
  message: "auth.validation.passwordsMismatch",
  path: ["confirmPassword"],
};

// ---------------------------------------------------------------------------
// Form schemas
// ---------------------------------------------------------------------------

export const signInSchema = z.object({
  email: emailSchema,
  password: currentPasswordSchema,
});

/** What the server needs to create an account. */
const accountFields = {
  name: nameSchema,
  email: emailSchema,
  password: newPasswordSchema,
};

export const signUpSchema = z
  .object({ ...accountFields, confirmPassword: newPasswordFields.confirmPassword })
  .refine(passwordsMatch, passwordMismatchError);

// ---------------------------------------------------------------------------
// Action schemas
//
// The server contract, not the form: the confirmation field is a UI concern
// and never reaches the server. The field schemas are shared, so their
// `.prefault("")` still applies; a missing field becomes "" and fails the
// length checks, which is the intended outcome.
// ---------------------------------------------------------------------------

export const setupRootAdminSchema = z.object(accountFields);

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object(newPasswordFields)
  .refine(passwordsMatch, passwordMismatchError);

export const authenticatorChallengeSchema = z.object({
  code: authenticatorCodeSchema,
});

export const recoveryChallengeSchema = z.object({ code: recoveryCodeSchema });

export const emailChallengeSchema = z.object({ code: emailCodeSchema });

export const enrollmentPasswordSchema = z.object({
  password: currentPasswordSchema,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SignInSchema = z.infer<typeof signInSchema>;
export type SignUpSchema = z.infer<typeof signUpSchema>;
export type SetupRootAdminSchema = z.infer<typeof setupRootAdminSchema>;
export type ForgotPasswordSchema = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordSchema = z.infer<typeof resetPasswordSchema>;
export type AuthenticatorChallengeSchema = z.infer<
  typeof authenticatorChallengeSchema
>;
export type RecoveryChallengeSchema = z.infer<typeof recoveryChallengeSchema>;
export type EmailChallengeSchema = z.infer<typeof emailChallengeSchema>;
export type EnrollmentPasswordSchema = z.infer<typeof enrollmentPasswordSchema>;
