import "server-only";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getFreshSession, type FreshSession } from "@/src/lib/auth/session";
import { authorize, type RouteDef } from "./routes";

/**
 * Page factory bound to the application's redirect targets, which the app
 * supplies (`app/_/access.ts`); this module knows no routes of its own.
 */
export type PageFactoryOptions = {
  /** Where guests go. */
  signIn: string;
  /** Where a signed-in viewer goes when a page refuses them. */
  denied: (session: FreshSession) => string;
};

export function createPageFactory({ signIn, denied }: PageFactoryOptions) {
  /**
   * Enforces a declared route's `access` against the fresh session and
   * returns the session. Prefer `page()`; use this directly only where a page
   * factory does not fit (a layout, a route handler).
   */
  async function guard(route: RouteDef): Promise<FreshSession | null> {
    const session = await getFreshSession();

    if (route.access === "public") {
      return session;
    }

    if (!session) {
      redirect(signIn);
    }

    if (!authorize(session.user, route.access)) {
      redirect(denied(session));
    }

    return session;
  }

  /**
   * A page is written as `export default page(route, render)`, so the access
   * check is part of how the page is declared rather than a call to remember.
   * `render` receives the page props and the resolved session.
   */
  function page<P = Record<string, never>>(
    route: RouteDef,
    render: (props: P, session: FreshSession | null) => ReactNode | Promise<ReactNode>,
  ) {
    return async function GuardedPage(props: P) {
      const session = await guard(route);
      return render(props, session);
    };
  }

  return { guard, page };
}
