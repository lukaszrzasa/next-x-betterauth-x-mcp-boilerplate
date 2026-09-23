import type { auth } from "../../index";
import type { RequiredStepUp } from "../../2fa";

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
  log: Logger;
};
