# Agent instructions

## Before changing behavior

Read [architecture.md](architecture.md) when choosing ownership, changing access/security policy, adding an entry point, or modifying cross-module collaboration. Read [CONTEXT.md](CONTEXT.md) when using administration terminology. Consult relevant module contracts before calling their operations. These documents describe intended behavior; existing code is evidence of current behavior, not permission to contradict them.

Identify the requested outcome, owning capability, necessary UI/SSR/action/MCP surfaces, access requirements, sensitivity, and existing reusable code. Resolve routine choices from established conventions. Ask a focused question only when an unresolved decision materially changes product behavior, authority, scope, or an enduring contract.

## Implement the requested outcome

- Keep module-wide implementation in `app/(ModuleName)/_` and dashboard-only implementation in `app/(ModuleName)/admin/_`. Admin code may use module-wide code; non-admin code cannot import admin implementation, even through types or re-exports. Use `operations/` for shared action definitions, one `actions.ts` per scope for Server Action exports, and `db/` for database services. Create other responsibility subdirectories as needed. Global infrastructure and utilities belong in `src/lib`, and generic UI in `src/components`.
- Search for existing helpers before adding code. Reuse or promote code with the same meaning; preserve semantic differences such as date-only versus timestamp formatting. Create files when behavior needs them, not to complete a scaffold.
- Import directly from other modules as needed. Dedicated export files and cross-module boundary checks are not required. Preserve admin-scope isolation and server/client separation; use `import type` for type-only dependencies.
- Share business operations across Server Actions and selected MCP tools; SSR reads share policy without calling a Server Action. Keep validation, permissions, verification, and business behavior in the guarded operation path. Keep `defineAction` definitions in `operations/`; they already represent guarded operations. `actions.ts` adapts them through `toServerAction`, while `mcp.ts` explicitly registers selected definitions. Database access belongs in the owning scope’s `db/`, which holds persistence only: the handler decides order, refusals, charges, effects and outcomes, and `db/` returns facts (a row, null, changed or not).
- Require the appropriate branded `ctx` as the first argument of every persistence entry function an operation calls, including reads. Forward the builder-supplied context even when the query does not use it. Never make it optional, fabricate it, or bypass its type with an assertion. Small tasks can live directly in the definition’s handler; an additional business-logic wrapper is not required.
- Admin skips role permissions, not authentication, verification, business invariants, or the MCP restriction. Other roles use the shared permission configuration.
- Sensitive operations cannot run through MCP. Classify sensitivity on the operation and enforce it there, in addition to omitting the tool. Register tools explicitly for an agreed workflow; do not generate tools from public exports or all actions.
- Complete necessary integration where established conventions make placement clear. Additional product surfaces and unrelated migrations need a requirement; a feature request is not a mandate to reorganize neighboring code.

## Exceptions and conflicts

Local, reversible departures from a layout or extraction default need a concrete reason recorded near the affected contract when that reason will matter later. Hard constraints cannot be waived to make an implementation convenient. In particular, do not bypass admin-scope isolation or expose operations through MCP without explicit opt-in, or combine MCP opt-in with step-up.

When code and accepted documentation disagree, investigate the relevant implementation and tests. Fix ordinary drift within authorized scope; ask when resolving the contradiction would change intended behavior. Treat examples and historical rationale as evidence rather than overriding an explicit current requirement. Update the authoritative rule instead of duplicating it in several documents.

## Completion

Verify the changed behavior at its shared operation and the affected entry points. Include meaningful denial cases for permission, verification, and MCP restrictions when changing those policies. Run relevant type and build checks. Verify that the installed Next.js compiler accepts factory-produced Server Action exports; otherwise use a minimal explicit async wrapper with inferred types. Avoid tests that merely restate forwarding implementation or formatting.

When changing authentication, verify direct calls as well as page access, current authority after revocation, and restricted enrollment/recovery paths. A layout redirect alone is not access enforcement.

Check that every requested surface works, affected existing tools/contracts remain consistent, and no unrequested surface was added. Report the result, verification performed, significant assumptions, and any remaining limitations. Do not claim a check passed without running it.
