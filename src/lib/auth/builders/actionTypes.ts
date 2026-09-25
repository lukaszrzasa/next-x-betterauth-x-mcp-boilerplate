import type { ZodType } from "zod";

import type { Connector, Permission } from "../permissions";
import type { StepUpPolicy } from "../stepUpPolicy";
import type { StepUpProof } from "../stepUp";
import type { AuditEvent } from "./actionAudit";
import type { AuthedCtx, PublicCtx } from "./context";

/** Request metadata stays separate from the action's validated input. */
export type ActionMeta = {
  headers: Headers;
  /** Set by trusted server adapters, never copied from client input. */
  entryPoint: "server-action" | "route-handler" | "mcp";
  stepUp?: StepUpProof;
};

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

/** TInput is the schema's raw input, which may differ from its parsed output. */
export type Action<TInput, TOutput> = {
  (input: TInput, meta: ActionMeta): Promise<TOutput>;
  readonly mcpAllowed: boolean;
};
