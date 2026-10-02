import { headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { messagesFor } from "@/src/lib/app/messages";
import { appConfig } from "@/src/lib/config";
import { formats } from "./formats";
import { requestLocale } from "./resolveLocale";

/**
 * next-intl's per-request configuration, registered in `next.config.ts`.
 * The locale is whatever the proxy negotiated for this request; the
 * catalog is the composed one for that locale. Server components,
 * `getTranslations`/`getFormatter` and the client provider all read this.
 */
export default getRequestConfig(async () => {
  const locale = requestLocale(await headers());
  return {
    locale,
    messages: messagesFor(locale),
    formats,
    timeZone: appConfig.timeZone,
  };
});
