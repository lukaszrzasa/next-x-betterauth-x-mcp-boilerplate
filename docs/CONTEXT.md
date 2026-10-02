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

**Staff log**:
The record of what staff changed: one entry per staff action that succeeded, saying who acted, on what, and what happened in a sentence built from snapshot blocks. It does not hold refused or failed attempts, actions of users on their own account, or sent emails.
_Avoid_: Audit log, activity log

**Block**:
One part of a staff log message, such as a piece of text, a user, a date or a value. A block is a snapshot: it shows what was true when the action happened and needs nothing else to be displayed.

**Locale**:
The language a request is served in, negotiated once by the proxy from the browser and carried as a request header. It is not a user setting yet; the build's `appConfig.locales` says which languages exist.
_Avoid_: Language setting, preference

**Message descriptor**:
What a refusal says, as a catalog key plus its values. Operations raise descriptors; the adapter that answers the caller turns them into a sentence in the request's locale.
_Avoid_: Error message when the server-side object is meant

**Catalog**:
The ICU messages of one scope and one locale, a JSON file next to the scope's code. English is the source of truth and the other locales mirror its keys.

