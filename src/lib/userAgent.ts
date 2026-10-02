/** First matching label wins, so more specific platforms come before the ones they contain. */
const PLATFORMS: ReadonlyArray<readonly [label: string, matches: (ua: string) => boolean]> = [
  ["iPhone", (ua) => ua.includes("iPhone")],
  ["iPad", (ua) => ua.includes("iPad")],
  ["Android", (ua) => ua.includes("Android")],
  ["Windows", (ua) => ua.includes("Windows")],
  ["Mac", (ua) => ua.includes("Macintosh") || ua.includes("Mac OS")],
  ["Chromebook", (ua) => ua.includes("CrOS")],
  ["Linux", (ua) => ua.includes("Linux")],
];

/** Chromium-based browsers also claim Chrome and Safari, so they are checked first. */
const BROWSERS: ReadonlyArray<readonly [label: string, matches: (ua: string) => boolean]> = [
  ["Edge", (ua) => /Edg\//.test(ua)],
  ["Opera", (ua) => /OPR\//.test(ua)],
  ["Firefox", (ua) => /Firefox\//.test(ua)],
  ["Chrome", (ua) => /Chrome\//.test(ua) || /CriOS\//.test(ua)],
  ["Safari", (ua) => /Safari\//.test(ua)],
];

function firstMatch(rules: typeof PLATFORMS, userAgent: string): string | null {
  return rules.find(([, matches]) => matches(userAgent))?.[0] ?? null;
}

/** The product names are proper nouns; only the sentence around them is language-specific. */
export type DeviceWording = {
  unknown: string;
  /** "{browser} on {platform}" */
  browserOnPlatform: (browser: string, platform: string) => string;
};

const ENGLISH: DeviceWording = {
  unknown: "Unknown device",
  browserOnPlatform: (browser, platform) => `${browser} on ${platform}`,
};

/** The `common.device` translator as `DeviceWording`, for callers inside a React tree. */
export function deviceWording(
  t: (key: "unknown" | "browserOnPlatform", values?: Record<string, string>) => string,
): DeviceWording {
  return {
    unknown: t("unknown"),
    browserOnPlatform: (browser, platform) => t("browserOnPlatform", { browser, platform }),
  };
}

/**
 * A conservative, generic device label from a User-Agent string: the
 * platform family and, when obvious, the browser. Anything unrecognised is
 * "Unknown device"; the original string is for the details view. The
 * wording defaults to English; pass `deviceWording(useTranslations("common.device"))`
 * for the viewer's language.
 */
export function describeUserAgent(userAgent: string | null, wording: DeviceWording = ENGLISH): string {
  if (!userAgent) return wording.unknown;
  const platform = firstMatch(PLATFORMS, userAgent);
  const browser = firstMatch(BROWSERS, userAgent);
  if (platform && browser) return wording.browserOnPlatform(browser, platform);
  return platform ?? browser ?? wording.unknown;
}
