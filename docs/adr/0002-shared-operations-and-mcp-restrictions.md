---
status: accepted
---

# Share business operations across entry points

Server Actions and selected MCP tools call the same business operations so validation, authorization, required verification, and side effects are not reimplemented per transport. SSR reads share the permission policy without invoking Server Actions. This introduces adapter plumbing but allows additional transports without adding unused REST scaffolding; `operations/` holds shared `defineAction` definitions, `actions.ts` exposes Server Actions, and `mcp.ts` registers selected tools. A definition’s handler can directly call its context-requiring service without another business-logic wrapper.

MCP access requires explicit operation opt-in, including for admins. MCP eligibility and step-up are separate declarations: browser-only operations need not require step-up, but MCP-eligible operations cannot require it. Enforce this in the shared operation policy using trusted caller information supplied by the entry adapter, as well as excluding operations without opt-in from registration. An untrusted input flag must not let a caller claim a different entry point. Full admin permissions do not bypass either policy.

