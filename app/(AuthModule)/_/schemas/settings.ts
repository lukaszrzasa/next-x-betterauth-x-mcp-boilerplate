import { z } from "zod";
import {
  authenticatorCodeSchema,
  currentPasswordSchema,
  emailSchema,
  nameSchema,
  newPasswordSchema,
} from "@/app/(AuthModule)/_/schema";
import { SESSION_PAGE_SIZE } from "@/app/(AuthModule)/_/types/settings";

/**
 * Input contracts of the account settings. Operation schemas are strict and
 * carry only what the server needs; form schemas add the confirmation and
 * presentation fields the person types and never submit. The field rules
 * come from the module's shared primitives (one password policy, one email
 * normalization, one display-name rule).
 */

// ---------------------------------------------------------------------------
// Field schemas
// ---------------------------------------------------------------------------

/** Opaque server-generated identifiers (request IDs, provider session IDs): no UUID assumption. */
export const opaqueIdSchema = z
  .string()
  .trim()
  .min(1, "auth.validation.identifierRequired")
  .max(128)
  .refine((value) => !/[\u0000-\u001F\u007F/\\]/.test(value), "auth.validation.identifierInvalid");

/** 32 random bytes as base64url: exactly 43 characters of that alphabet, validated before any lookup. */
export const CONFIRMATION_TOKEN_LENGTH = 43;
export const confirmationTokenSchema = z
  .string()
  .regex(new RegExp(`^[A-Za-z0-9_-]{${CONFIRMATION_TOKEN_LENGTH}}$`), "auth.validation.linkInvalid");

/** Bounded, one-based; the service clamps to the last existing page. */
export const SESSIONS_MAX_PAGE = 1_000_000;
export const sessionPageSchema = z.int().min(1).max(SESSIONS_MAX_PAGE);

const optionalAuthenticatorCodeSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{6}$/.test(value), "auth.validation.authenticatorCode")
  .prefault("");

// ---------------------------------------------------------------------------
// Operation inputs (strict)
// ---------------------------------------------------------------------------

export const updateDisplayNameSchema = z.strictObject({ name: nameSchema });

export const beginEmailChangeSchema = z.strictObject({ currentPassword: currentPasswordSchema });

/** The authenticator code is required only for an enrolled account; the service decides. */
export const beginEmailCorrectionSchema = z.strictObject({
  currentPassword: currentPasswordSchema,
  newEmail: emailSchema,
  authenticatorCode: optionalAuthenticatorCodeSchema.transform((value) => value || undefined),
});

export const selectNewEmailSchema = z.strictObject({
  requestId: opaqueIdSchema,
  newEmail: emailSchema,
});

export const emailRequestTargetSchema = z.strictObject({ requestId: opaqueIdSchema });

export const emailProofSchema = z.strictObject({ token: confirmationTokenSchema });

export const changePasswordSchema = z
  .strictObject({
    currentPassword: currentPasswordSchema,
    newPassword: newPasswordSchema,
    revokeOtherSessions: z.boolean(),
  })
  .refine((input) => input.currentPassword !== input.newPassword, {
    message: "auth.validation.passwordUnchanged",
    path: ["newPassword"],
  });

export const completePasswordResetSchema = z.strictObject({
  token: z.string().trim().min(1, "auth.validation.resetLinkInvalid").max(256),
  newPassword: newPasswordSchema,
});

export const currentPasswordOnlySchema = z.strictObject({ currentPassword: currentPasswordSchema });

export const confirmSetupSchema = z.strictObject({
  requestId: opaqueIdSchema,
  code: authenticatorCodeSchema,
});

export const setupTargetSchema = z.strictObject({ requestId: opaqueIdSchema });

export const listSessionsSchema = z.strictObject({ page: sessionPageSchema });

export const sessionTargetSchema = z.strictObject({ sessionId: opaqueIdSchema });

// ---------------------------------------------------------------------------
// Form inputs (what the person types; confirmation fields stay in the browser)
// ---------------------------------------------------------------------------

export const displayNameFormSchema = z.object({ name: nameSchema });

export const emailChangeFormSchema = z.object({ currentPassword: currentPasswordSchema });

export const emailCorrectionFormSchema = z.object({
  newEmail: emailSchema,
  currentPassword: currentPasswordSchema,
  authenticatorCode: optionalAuthenticatorCodeSchema,
});

export const newEmailFormSchema = z.object({ newEmail: emailSchema });

export const changePasswordFormSchema = z
  .object({
    currentPassword: currentPasswordSchema,
    newPassword: newPasswordSchema,
    confirmNewPassword: z.string().prefault(""),
    revokeOtherSessions: z.boolean().prefault(true),
  })
  .refine((input) => input.newPassword === input.confirmNewPassword, {
    message: "auth.validation.passwordsMismatch",
    path: ["confirmNewPassword"],
  })
  .refine((input) => input.currentPassword !== input.newPassword, {
    message: "auth.validation.passwordUnchanged",
    path: ["newPassword"],
  });

export const currentPasswordFormSchema = z.object({ currentPassword: currentPasswordSchema });

export const setupCodeFormSchema = z.object({ code: authenticatorCodeSchema });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UpdateDisplayNameSchema = z.infer<typeof updateDisplayNameSchema>;
export type BeginEmailChangeSchema = z.infer<typeof beginEmailChangeSchema>;
export type BeginEmailCorrectionSchema = z.infer<typeof beginEmailCorrectionSchema>;
export type SelectNewEmailSchema = z.infer<typeof selectNewEmailSchema>;
export type EmailRequestTargetSchema = z.infer<typeof emailRequestTargetSchema>;
export type EmailProofSchema = z.infer<typeof emailProofSchema>;
export type ChangePasswordSchema = z.infer<typeof changePasswordSchema>;
export type CompletePasswordResetSchema = z.infer<typeof completePasswordResetSchema>;
export type CurrentPasswordOnlySchema = z.infer<typeof currentPasswordOnlySchema>;
export type ConfirmSetupSchema = z.infer<typeof confirmSetupSchema>;
export type SetupTargetSchema = z.infer<typeof setupTargetSchema>;
export type ListSessionsSchema = z.infer<typeof listSessionsSchema>;
export type SessionTargetSchema = z.infer<typeof sessionTargetSchema>;
export type DisplayNameFormSchema = z.infer<typeof displayNameFormSchema>;
export type EmailChangeFormSchema = z.infer<typeof emailChangeFormSchema>;
export type EmailCorrectionFormSchema = z.infer<typeof emailCorrectionFormSchema>;
export type NewEmailFormSchema = z.infer<typeof newEmailFormSchema>;
export type ChangePasswordFormSchema = z.infer<typeof changePasswordFormSchema>;
export type CurrentPasswordFormSchema = z.infer<typeof currentPasswordFormSchema>;
export type SetupCodeFormSchema = z.infer<typeof setupCodeFormSchema>;

/** The page size is part of the contract, so the list operation states it too. */
export const SESSIONS_PAGE_SIZE = SESSION_PAGE_SIZE;
