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

/**
 * A conservative, generic device label from a User-Agent string: the
 * platform family and, when obvious, the browser. Anything unrecognised is
 * "Unknown device"; the original string is for the details view.
 */
export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const platform = firstMatch(PLATFORMS, userAgent);
  const browser = firstMatch(BROWSERS, userAgent);
  if (platform && browser) return `${browser} on ${platform}`;
  return platform ?? browser ?? "Unknown device";
}
