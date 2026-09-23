# Administration

Terms used by the administration and access-control model.

## Language

**Admin**:
A user whose administrative authority is unrestricted by role permissions. Required identity verification and business rules still apply.

**Staff**:
A user permitted to enter the administration panel, including admin and any permitted limited roles. All staff are subject to panel sign-in verification and participate in editing presence.
_Avoid_: Admin when referring to all panel users

**Editing presence**:
An indication that a staff member has an editing form page open. It does not imply unsaved changes, active typing, or exclusive editing rights.
_Avoid_: Dirty state, edit lock

**Sensitive operation**:
An operation designated as requiring fresh identity verification and unavailable through MCP. Classification and verification policy are defined in the architecture document.
