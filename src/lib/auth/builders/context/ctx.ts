import "server-only";

import type { RequiredStepUp } from "@/src/lib/auth/stepUpPolicy";
import type { CtxInit, Logger, Session, User } from "./types";

/**
 * Capability passed to server-side services.
 *
 * The builder gives handlers a Ctx only after all gates pass. Audit hooks can
 * also receive a context for a denied request; stepUp stays null until
 * step-up succeeds. Branding prevents structural lookalikes, and lint prevents
 * feature code from importing the factory at runtime.
 *
 * These guardrails prevent accidental bypasses in trusted server code. The
 * private constructor funnels construction through the factory; it is not a
 * security boundary against code authors. `as unknown as Ctx` still compiles,
 * and Ctx.is only checks provenance, not permissions or completed gates.
 */
export class Ctx<TUser extends User | null = User> {
  readonly #brand = "action-ctx";

  readonly user: TUser;
  readonly session: TUser extends User ? Session : null;
  readonly stepUp: RequiredStepUp | null;

  readonly requestId: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly log: Logger;

  /**
   * The acting request's headers, kept private so a context serialized by
   * mistake (a DTO spread, a log line) never carries cookies. Services read
   * them only through `getRequestHeaders()`, and only to call provider APIs
   * that authenticate the actor (`auth.api.adminUpdateUser`, `banUser`, ...).
   */
  readonly #requestHeaders: Headers;

  private constructor(init: CtxInit<TUser>) {
    this.user = init.user;
    this.session = init.session;
    this.stepUp = init.stepUp;
    this.requestId = init.requestId;
    this.ip = init.ip;
    this.userAgent = init.userAgent;
    this.#requestHeaders = new Headers(init.requestHeaders);
    this.log = init.log;
  }

  /** A fresh copy each call: callers cannot mutate what later callers see. */
  getRequestHeaders(): Headers {
    return new Headers(this.#requestHeaders);
  }

  /** @internal */
  static create<TUser extends User | null>(init: CtxInit<TUser>): Ctx<TUser> {
    return new Ctx(init);
  }

  /**
   * @internal The builder calls this once step-up has been verified. Contexts
   * are immutable: anything holding the pre-verification context keeps a
   * context that claims no step-up.
   */
  withStepUp(stepUp: RequiredStepUp): Ctx<TUser> {
    return new Ctx<TUser>({ ...this, requestHeaders: this.#requestHeaders, stepUp });
  }

  /**
   * Runtime check for services that want to validate a context.
   */
  static is(value: unknown): value is Ctx<User | null> {
    return typeof value === "object" && value !== null && #brand in value;
  }
}

export type AuthedCtx = Ctx<User>;
export type PublicCtx = Ctx<null>;
