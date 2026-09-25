/**
 * Route templates use Next's segment syntax, so a template reads like the
 * folder that serves it: `"/users/[id]"`, `"/docs/[...slug]"`.
 *
 * `buildRoute` fills the segments and appends a query string. Which parameters
 * a template needs is derived from the template type, so a missing or misspelled
 * parameter fails to compile:
 *
 * ```ts
 * buildRoute("/users/[id]", { id: user.id });                 // "/users/42"
 * buildRoute("/auth/reset-password", { token });              // type error: no params
 * buildRoute("/auth/reset-password", undefined, { token });   // "/auth/reset-password?token=…"
 * buildRoute("/docs/[...slug]", { slug: ["a", "b"] });        // "/docs/a/b"
 * ```
 *
 * Each module lists its own routes in a `routes.ts` next to its pages, and
 * every redirect, link and allow-list reads from that table rather than
 * repeating the string.
 */

type Segment<T extends string> =
  T extends `${string}[...${infer Rest}]${infer Tail}`
    ? Rest | Segment<Tail>
    : T extends `${string}[${infer Name}]${infer Tail}`
      ? Name | Segment<Tail>
      : never;

type ParamValue<Name extends string, T extends string> =
  T extends `${string}[...${Name}]${string}` ? readonly (string | number)[] : string | number;

export type RouteParams<T extends string> = {
  [Name in Segment<T>]: ParamValue<Name, T>;
};

export type RouteQuery = Record<
  string,
  string | number | boolean | null | undefined
>;

/** Templates without segments take an optional query only. */
type BuildRouteArgs<T extends string> = [Segment<T>] extends [never]
  ? [params?: undefined, query?: RouteQuery]
  : [params: RouteParams<T>, query?: RouteQuery];

const SEGMENT = /\[(\.\.\.)?([^\]]+)\]/g;

export function buildRoute<T extends string>(
  template: T,
  ...[params, query]: BuildRouteArgs<T>
): string {
  const path = template.replace(SEGMENT, (_match, spread, name: string) => {
    const value = (params as Record<string, unknown> | undefined)?.[name];
    if (value === undefined || value === null) {
      throw new Error(`Route "${template}" is missing parameter "${name}".`);
    }
    return spread && Array.isArray(value)
      ? value.map((part) => encodeURIComponent(String(part))).join("/")
      : encodeURIComponent(String(value));
  });

  return withQuery(path, query);
}

/** Appends `query` to `path`, skipping null and undefined values. */
export function withQuery(path: string, query?: RouteQuery): string {
  if (!query) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `${path}?${encoded}` : path;
}
