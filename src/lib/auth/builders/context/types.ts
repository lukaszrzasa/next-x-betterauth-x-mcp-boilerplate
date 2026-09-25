import type { auth } from "@/src/lib/auth/index";
import type { RequiredStepUp } from "@/src/lib/auth/stepUpPolicy";

export type Session = (typeof auth.$Infer.Session)["session"];
export type User = (typeof auth.$Infer.Session)["user"];

export type Logger = {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
};

export type CtxInit<TUser extends User | null> = {
  user: TUser;
  session: TUser extends User ? Session : null;
  stepUp: RequiredStepUp | null;
  requestId: string;
  ip: string | null;
  userAgent: string | null;
  /** The acting request's headers; the builder passes a copy of `meta.headers`. */
  requestHeaders: Headers;
  log: Logger;
};
