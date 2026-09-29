import type { EmailChangePurpose } from "@/src/lib/email";
import { sha256Hex } from "@/src/lib/sha256Hex";

/**
 * The Redis counter names behind `policies/limits.ts`, all under `settings:`. Codes
 * and IPs are hashed so no secret or address ends up in a key.
 */
export const settingsThrottleKeys = {
  currentPasswordFailures: (userId: string) => `settings:password-fail:${userId}`,

  emailInitiations: (userId: string) => `settings:email-init:${userId}`,
  emailSendCooldown: (userId: string, purpose: EmailChangePurpose) => `settings:email-send:${userId}:${purpose}`,
  emailSends: (userId: string) => `settings:email-sends:${userId}`,
  proofAttempts: (requestId: string) => `settings:proof:${requestId}`,
  unknownProofsFromIp: (ip: string) => `settings:proof-ip:${sha256Hex(ip)}`,
  verificationResendCooldown: (userId: string) => `settings:verification-send:${userId}`,

  setupInitiations: (userId: string) => `settings:factor-init:${userId}`,
  setupCodeAttempts: (requestId: string) => `settings:factor-code:${requestId}`,
  spentSetupCode: (requestId: string, code: string) => `settings:factor-code-used:${requestId}:${sha256Hex(code)}`,
} as const;
