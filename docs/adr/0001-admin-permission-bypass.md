---
status: accepted
---

# Admin bypasses role-permission checks

The admin role has unrestricted administrative authority: new application permissions do not require explicit admin grants. Other roles use the shared Better Auth permission configuration. This favors predictable full administrative authority over requiring administrators to be explicitly granted each new capability; authentication, required second-factor verification, validation, and business invariants remain independent requirements.

All application entry points must preserve this meaning. The Better Auth plugin and application adapters must produce consistent authorization decisions; sharing a configuration file alone does not guarantee identical evaluation.

