import { createAuthClient } from "better-auth/react";
import { magicLinkClient, twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    magicLinkClient(),

    /**
     * No `twoFactorPage` / `onTwoFactorRedirect` yet: without it the client
     * simply hands the caller `data.twoFactorRedirect === true` after a
     * password sign-in, plus `data.twoFactorMethods` (`["totp", "otp"]`), and
     * the caller decides what to render. Once a challenge view exists, pass:
     *
     *   twoFactorClient({
     *     onTwoFactorRedirect: () => router.push("/two-factor"),
     *   })
     */
    twoFactorClient(),
  ],
});
