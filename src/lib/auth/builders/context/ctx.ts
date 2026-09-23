import "server-only";

import type { RequiredStepUp } from "../../2fa";
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

  private constructor(init: CtxInit<TUser>) {
    this.user = init.user;
    this.session = init.session;
    this.stepUp = init.stepUp;
    this.requestId = init.requestId;
    this.ip = init.ip;
    this.userAgent = init.userAgent;
    this.log = init.log;
  }

  /** @internal */
  static create<TUser extends User | null>(init: CtxInit<TUser>): Ctx<TUser> {
    return new Ctx(init);
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
