# Project design

## Documents

1. [Architecture](architecture.md): scope, shared operations, layout, import scopes, authorization, sensitivity, MCP, and infrastructure.
2. [Agent instructions](agent-instructions.md): working conventions and completion criteria.
3. [Glossary](CONTEXT.md): admin, staff, editing presence, and sensitive operation.
4. [Admin authority decision](adr/0001-admin-permission-bypass.md) and [shared-operation decision](adr/0002-shared-operations-and-mcp-restrictions.md): rationale for consequential choices.

[Design evidence](evidence.md) records observations behind the decisions. It is background material, not an additional source of instructions.

## Behavioral acceptance scenarios

| Scenario | Expected agent behavior |
| --- | --- |
| Add a field to an existing form | Update the existing operation/UI and affected contracts; no automatic MCP tool or navigation addition. |
| Add a capability with no agent workflow | No MCP scaffold solely because the capability exists. |
| Modify account lookup | Keep SSR/action/MCP consumers of that behavior consistent; preserve caller permissions and bounded safe output. |
| Admin invokes a sensitive operation via MCP | Deny despite admin permission bypass and any recent verification. |
| Moderator looks up users | Allow only with current lookup permission and required staff authentication. |
| Staff member opens an editing form | Show presence; do not add dirty indicators or edit locks. |
| Another capability needs user lookup | Import the existing operation directly, respecting admin scope and runtime requirements. |
| Module-wide code imports an admin type | Reject the import; `types.ts` does not waive admin isolation. |
| Global authentication support is needed | Use `src/lib/auth`; do not introduce an app infrastructure module. |
| A module grows large | Subdivide `operations/`, `db/`, and other responsibility directories within its two scopes; keep `actions.ts` focused on exports. |
| Two pages need the same date format | Find/reuse the shared semantic helper, or promote a matching local helper; do not copy it. |
| Only one capability needs an image transformation | Keep it local unless deliberate shared use is established. |
| A requested operation has one simple query | Keep the query in `db/` and call it directly from the `defineAction` handler in `operations/`; no extra business-logic wrapper. |
| A one-line fix touches older structure | Make the coherent fix; do not infer authorization for a migration. |
| A staff account has not enrolled its factor | Permit only the enrollment/verification flow until access requirements are satisfied. |
| Redis holding verification grants is unavailable | Fail affected protected operations; never skip verification. |

