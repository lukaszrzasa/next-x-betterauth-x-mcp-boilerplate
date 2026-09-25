import type { ZodType } from "zod";

import type { Connector, Permission, RoleName } from "@/src/lib/auth/permissions";
import type { StepUpPolicy, StepUpProof } from "@/src/lib/auth/stepUpPolicy";
import type { AuditEvent } from "./actionAudit";
import type { AuthedCtx, PublicCtx } from "./context";

/** Request metadata stays separate from the action's validated input. */
export type ActionMeta = {
  headers: Headers;
  /**
   * Set by trusted server adapters, never copied from client input.
   * `server-render` is the trusted SSR read path (`toServerQuery`): a page
   * rendering on the server, with no browser-supplied metadata.
   */
  entryPoint: EntryPoint;
  stepUp?: StepUpProof;
};

export const ENTRY_POINTS = ["server-action", "route-handler", "mcp", "server-render"] as const;
export type EntryPoint = (typeof ENTRY_POINTS)[number];

export type BaseConfig<TCtx, TInput, TOutput, TRawInput = TInput> = {
  name: string;
  /** Omit for actions without input; the handler receives undefined. */
  schema?: ZodType<TInput, TRawInput>;
  auditLog?: (
    ctx: TCtx,
    event: AuditEvent<TInput, TOutput>,
  ) => string | Promise<string>;
  handler: (ctx: TCtx, input: TInput) => TOutput | Promise<TOutput>;
};

export type OperationPolicy =
  | { mcpAllowed: true; stepUp?: "none" }
  | { mcpAllowed?: false; stepUp?: StepUpPolicy };

export type AuthedConfig<TInput, TOutput, TRawInput = TInput> = BaseConfig<
  AuthedCtx,
  TInput,
  TOutput,
  TRawInput
> & OperationPolicy & {
  auth?: "session";
  /**
   * The actor must hold at least one of these roles (the same rule as a
   * route's `access.roles`). A miss answers NOT_FOUND rather than FORBIDDEN,
   * so an area meant for staff does not reveal itself to other accounts.
   * Roles admit; `permissions` still decide what the role may do.
   */
  roles?: readonly RoleName[];
  /** Omitted, null or empty means no permission check. */
  permissions?: Permission | readonly Permission[] | null;
  permissionsConnector?: Connector;
  /** Step-up also requires verified email. */
  requireVerifiedEmail?: boolean;
};

export type PublicConfig<TInput, TOutput, TRawInput = TInput> = BaseConfig<
  PublicCtx,
  TInput,
  TOutput,
  TRawInput
> & {
  auth: "public";
  mcpAllowed?: boolean;
  stepUp?: "none";
};

/**
 * A defined operation. Callers pass the schema's *raw* input; the parsed
 * output type is what the handler saw, not what the caller sends.
 */
export type Action<TRawInput, TOutput> = {
  (input: TRawInput, meta: ActionMeta): Promise<TOutput>;
  readonly mcpAllowed: boolean;
};
