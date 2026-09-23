# Administration

Terms used by the administration and access-control model.

## Language

**Admin**:
A user granted every declared administrative permission. Required identity verification and business rules still apply.

**Staff**:
A user permitted to enter the administration panel, including admin and any permitted limited roles. Staff must enroll the required second factor and participate in editing presence; remembered sign-in verification is distinct from operation step-up.
_Avoid_: Admin when referring to all panel users

**Editing presence**:
An indication that a staff member has an editing form page open. It does not imply unsaved changes, active typing, or exclusive editing rights.
_Avoid_: Dirty state, edit lock

**MCP eligibility**:
Whether an operation may be offered to an authenticated agent through MCP. Eligibility does not automatically expose an operation as a tool.
_Avoid_: Sensitive as a synonym for MCP exclusion

**Step-up requirement**:
An operation's requirement for additional identity verification, either reusable for five minutes in the same session or fresh for every invocation. An operation can be excluded from MCP without requiring step-up.

**Required second factor**:
A policy that a user must enroll a second verification method, distinct from whether enrollment is complete or a particular sign-in requires a fresh challenge.
