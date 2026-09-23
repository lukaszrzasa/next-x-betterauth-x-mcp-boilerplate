import { z } from "zod";
import { defineAction } from "@/src/lib/auth/builders/actionBuilder";
import { toServerAction } from "@/src/lib/auth/builders/adapters";
import type { AuthedCtx, PublicCtx } from "@/src/lib/auth/builders/context";

// Compile-only checks: callers use raw input; handlers and audits use parsed input.
export function checkActionTypes(headers: Headers) {
  // @ts-expect-error MCP operations cannot require step-up.
  defineAction({ name: "invalid", mcpAllowed: true, stepUp: "five_minutes", handler: () => {} });
  // @ts-expect-error Public operations cannot require authenticated step-up.
  defineAction({ name: "invalid", auth: "public", stepUp: "every_time", handler: () => {} });
  defineAction({ name: "browser-only", mcpAllowed: false, stepUp: "none", handler: () => {} });
  const transformed = defineAction({
    name: "typed.transform",
    schema: z.string().transform(Number),
    handler: (ctx, input) => {
      const authenticated: AuthedCtx = ctx;
      const number: number = input;
      return { userId: authenticated.user.id, number };
    },
    auditLog: async (ctx, event) => {
      const authenticated: AuthedCtx = ctx;
      if (event.outcome === "success") {
        const number: number = event.input;
        return `${authenticated.user.id}: ${number}`;
      }
      return event.outcome;
    },
  });
  const result: Promise<{ userId: string; number: number }> = transformed(
    "42",
    { headers, entryPoint: "server-action" },
  );
  const adapted = toServerAction(transformed);
  void adapted("42");
  // @ts-expect-error Clients cannot supply trusted provenance.
  void adapted("42", { entryPoint: "server-action" });
  // @ts-expect-error Clients cannot supply authentication headers.
  void adapted("42", { headers });
  // @ts-expect-error The raw input is a string, not the transformed number.
  void transformed(42, { headers, entryPoint: "server-action" });
  // @ts-expect-error Adapters preserve the action's raw input type.
  void adapted(42);

  const publicAction = defineAction({
    name: "typed.public",
    auth: "public",
    handler: (ctx, input) => {
      const anonymous: PublicCtx = ctx;
      const absent: undefined = input;
      return { user: anonymous.user, input: absent };
    },
  });
  void publicAction(undefined, { headers, entryPoint: "server-action" });
  return result;
}
