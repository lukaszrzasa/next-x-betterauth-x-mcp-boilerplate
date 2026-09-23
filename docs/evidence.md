# Design evidence

These observations explain the problems the architecture addresses. Source implementations are evidence, not requirements to preserve their structure.

## Unwanted behavior

- Agents created MCP tools without a useful agent workflow.
- Agents sometimes implemented only actions when the requested public functionality needed a REST interface. The lesson is explicit surface selection; REST is outside the present application scope.
- Technical helpers were modeled as business modules, while useful shared functions remained difficult to discover.

## Repository observations

Inspected source: `/Users/lukaszrzasa/WebstormProjects/torzeszowapi-2-agent`.

- `CLAUDE.md` requires MCP changes with every feature, while the Comments README explicitly omits module MCP tools. This conflict motivates workflow-based selection and explicit registration.
- Assets combines image encoding, upload restrictions, and media usage tracking. Technical reuse and business ownership are separate concerns; the entire capability is not a utility.
- Metrics contains product-specific subjects and dimensions alongside counting infrastructure. Global use does not remove product policy.
- Module `_` files are imported across capabilities. Direct cross-module imports are permitted; module encapsulation checks are deferred. Admin-only scope remains a separate restriction.

Inspected starter: `/Users/lukaszrzasa/WebstormProjects/next-x-betterauth-x-mcp-template`.

- One Better Auth instance consumes shared role definitions. The custom admin bypass and plugin evaluation still need matching semantics.
- The action builder centralizes validation, authorization, verification, and audit behavior, but its session-based identity path does not establish MCP identity automatically.
- Redis holds authentication state and verification data. Treating every Redis operation as optional would undermine those guarantees.
- Multiple step-up pools add policy complexity. One fixed verification window provides a simpler default.

## External references

- [Next.js project structure](https://nextjs.org/docs/app/getting-started/project-structure): underscore-prefixed folders are excluded from routing, not from imports.
- [Better Auth two-factor authentication](https://better-auth.com/docs/plugins/2fa): passwordless sign-in methods are not challenged by login 2FA by default. Password sign-in avoids inheriting that additional policy path.

## Alternatives considered

- Separate `src/modules` placement was rejected in favor of capability colocation under `app`.
- Explicit permission grants for admin were rejected in favor of unrestricted administrative authority.
- Automatic tool parity with actions was rejected in favor of selected workflows.
- Browser approval for sensitive MCP operations was rejected: those operations are unavailable through MCP.
- A complete media library, dirty-state presence, and edit locks were excluded to keep the requested scope focused.
