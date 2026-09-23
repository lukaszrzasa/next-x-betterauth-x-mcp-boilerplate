---
status: accepted
---

# Admin receives all declared permissions

The admin role receives the entire shared permission catalogue: new declared application permissions do not require separate admin grants. Other roles use the shared Better Auth permission configuration. This favors predictable full administrative authority over requiring administrators to be explicitly granted each new capability; authentication, required second-factor verification, validation, and business invariants remain independent requirements.

All application entry points must preserve this meaning. The Better Auth plugin and application adapters must produce consistent authorization decisions; sharing a configuration file alone does not guarantee identical evaluation.


Both application checks and the Better Auth plugin use the same role evaluator. Unknown permissions deny; `adminAc.statements` is a fixed library list, not root access. Identity-based `adminUserIds` bypass is unused and must remain empty. Authentication, step-up and MCP eligibility remain independent gates.
