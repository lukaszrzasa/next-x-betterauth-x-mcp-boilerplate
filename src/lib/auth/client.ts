import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

// The sign-in form handles the challenge in place, including recovery codes.
export const authClient = createAuthClient({ plugins: [twoFactorClient()] });
