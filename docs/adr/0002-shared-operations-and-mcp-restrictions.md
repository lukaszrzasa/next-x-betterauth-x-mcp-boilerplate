---
status: accepted
---

# Share business operations across entry points

Server Actions and selected MCP tools call the same business operations so validation, authorization, required verification, and side effects are not reimplemented per transport. SSR reads share the permission policy without invoking Server Actions. This introduces adapter plumbing but allows additional transports without adding unused REST scaffolding; `operations/` holds shared `defineAction` definitions, `actions.ts` exposes Server Actions, and `mcp.ts` registers selected tools. A definition’s handler can directly call its context-requiring db-service without another business-logic wrapper.

Sensitive operations cannot run through MCP, including for admins. Enforce this in the shared operation policy using trusted caller information supplied by the entry adapter, as well as excluding sensitive tools from registration. An untrusted input flag must not let a caller claim a different entry point. Admin permission bypass does not bypass this restriction or required verification.

