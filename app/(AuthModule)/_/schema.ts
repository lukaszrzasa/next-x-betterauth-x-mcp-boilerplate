import { z } from "zod";

// ---------------------------------------------------------------------------
// Field schemas
// ---------------------------------------------------------------------------

const emailSchema = z
  .email("Enter a valid email address.")
  .max(254)
  .toLowerCase()
  .prefault("");

const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(100)
  .prefault("");

/** A password being set: enforces the password policy. */
const newPasswordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(128)
  .prefault("");

/** A password being confirmed: the server compares the hash, so only "not empty" applies. */
const currentPasswordSchema = z
  .string()
  .min(1, "Enter your password.")
  .max(128)
  .prefault("");

const authenticatorCodeSchema = z
  .string()
  .regex(/^\d{6}$/, "Enter a six-digit authenticator code.")
  .prefault("");

const recoveryCodeSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/,
    "Enter a recovery code in the format xxxxx-xxxxx.",
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
  message: "Passwords do not match.",
  path: ["confirmPassword"],
};

// ---------------------------------------------------------------------------
// Form schemas
// ---------------------------------------------------------------------------

export const signInSchema = z.object({
  email: emailSchema,
  password: currentPasswordSchema,
});

export const signUpSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    ...newPasswordFields,
  })
  .refine(passwordsMatch, passwordMismatchError);

export const setupRootAdminSchema = signUpSchema;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object(newPasswordFields)
  .refine(passwordsMatch, passwordMismatchError);

export const authenticatorChallengeSchema = z.object({
  code: authenticatorCodeSchema,
});

export const recoveryChallengeSchema = z.object({ code: recoveryCodeSchema });

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
export type EnrollmentPasswordSchema = z.infer<typeof enrollmentPasswordSchema>;
