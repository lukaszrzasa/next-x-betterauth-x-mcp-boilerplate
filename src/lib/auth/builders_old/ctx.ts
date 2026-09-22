import "server-only";

import type { auth } from "../index";
import type { TwoFactorPoolName } from "../2fa";

type Session = (typeof auth.$Infer.Session)["session"];
type User = (typeof auth.$Infer.Session)["user"];

export type { Session, User };

export type Logger = {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
};

/* ---------------------------------------------------------------------------
 * Ctx
 * ------------------------------------------------------------------------- */

type CtxInit<TUser extends User | null> = {
  user: TUser;
  session: TUser extends User ? Session : null;
  twoFactorPool: TwoFactorPoolName | null;
  requestId: string;
  ip: string | null;
  userAgent: string | null;
  log: Logger;
};

/**
 * The single object every server-side call takes.
 *
 * It is a capability token, not a service locator: it carries no database
 * handle and no permission helper, only the facts the action builder has
 * already established. A db-service receiving a `Ctx` knows the request was
 * authenticated, permitted and - where required - stepped up, because there is
 * no other way to obtain one.
 *
 * Two things stop it being forged. The `#brand` field is a true private field,
 * so no object literal and no look-alike class is assignable to `Ctx`, and
 * `#brand in value` is a real runtime check rather than an erased one. The
 * constructor is private, so instances come only from `Ctx.create` - which
 * lives in this module, and this module is off-limits outside `src/lib` via
 * the `no-restricted-imports` zone in `eslint.config.mjs`.
 *
 * Neither is airtight on its own: `as unknown as Ctx` still compiles. They
 * raise the cost of the bypass from "write an object literal" to "deliberately
 * defeat two mechanisms that exist only to stop you", which is the point.
 */
export class Ctx<TUser extends User | null = User> {
  readonly #brand = "action-ctx";

  /** `null` only on actions declared `auth: "public"`. */
  readonly user: TUser;
  readonly session: TUser extends User ? Session : null;

  /** The step-up pool this request satisfied, if any. */
  readonly twoFactorPool: TwoFactorPoolName | null;

  readonly requestId: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly log: Logger;

  private constructor(init: CtxInit<TUser>) {
    this.user = init.user;
    this.session = init.session;
    this.twoFactorPool = init.twoFactorPool;
    this.requestId = init.requestId;
    this.ip = init.ip;
    this.userAgent = init.userAgent;
    this.log = init.log;
  }

  /** @internal Constructed by the action builder only. */
  static create<TUser extends User | null>(init: CtxInit<TUser>): Ctx<TUser> {
    return new Ctx<TUser>(init);
  }

  /**
   * Runtime counterpart to the compile-time brand, for db-services that want to
   * assert rather than trust - `#brand in value` cannot be satisfied by a cast.
   */
  static is(value: unknown): value is Ctx<User | null> {
    return typeof value === "object" && value !== null && #brand in value;
  }
}

/** A `Ctx` from an authenticated action: `user` and `session` are never null. */
export type AuthedCtx = Ctx<User>;
/** A `Ctx` from a `auth: "public"` action. */
export type PublicCtx = Ctx<null>;

/* ---------------------------------------------------------------------------
 * Logger
 * ------------------------------------------------------------------------- */

/**
 * One JSON line per event. Structured from the start so the audit records below
 * can be shipped to a table later without changing any call site.
 */
export function createLogger(base: Record<string, unknown>): Logger {
  const emit =
    (level: "info" | "warn" | "error") =>
    (message: string, fields: Record<string, unknown> = {}) => {
      const line = JSON.stringify({ level, message, ...base, ...fields });
      if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else console.log(line);
    };

  return { info: emit("info"), warn: emit("warn"), error: emit("error") };
}
