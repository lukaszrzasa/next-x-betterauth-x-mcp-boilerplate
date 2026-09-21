/**
 * Shared, framework-agnostic app metadata.
 *
 * Lives outside `src/lib/email` and `src/lib/auth` because both need it: the
 * email templates render it, and Better Auth uses it as the TOTP `issuer` -
 * the label authenticator apps show next to the code. Changing the issuer
 * later invalidates nothing, but it does rename every already-enrolled entry
 * in users' authenticator apps, so pick it once.
 */
export const appName = "Acme";
