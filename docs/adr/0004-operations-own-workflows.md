---
status: accepted
---

# Operations own workflows; persistence owns SQL

A use case is read in one place: its `defineAction` definition in `operations/`, one substantial use case per file. The handler is the sequence, top to bottom: what is checked first and which refusal the caller gets, when an attempt is charged, which provider call and effects run, whether the result is completed, unchanged or partial, and which confirmed change is logged. Before this decision the handlers forwarded to `db/` functions that did all of that, so the workflow was one hop further than the file that declared it, in a directory named after the database.

`db/` holds persistence: scoped reads with explicit columns, writes, the predicates of a conditional write, necessary transactions and the lock mechanics. It returns facts (a row or null, changed or not, a count, a known constraint conflict) and takes the application's decisions as values: a reason, a deadline, the stage that was observed. It sends no mail, charges no budget, calls no workflow and raises no business refusal. Provider and Redis integrations that are neither live in `services/`; pure rules with more than one caller live in `policies/`. Lint enforces the direction for the `db/` of the auth and logs modules.

A `WHERE` clause that repeats the owner, the expected stage, a token generation or a deadline is not misplaced business logic. It is the atomic form of the precondition the operation asked for, and the operation still interprets the result.

Coordination is chosen per flow, not applied to every account action. An ordinary edit is an ordinary write. A transition of one row is one conditional statement. Rows that must change together are one transaction. The account security lock remains only for the credential and factor protocol, whose steps commit on separate connections (retirement of pending requests, then the provider's write), and every call site names the race it excludes. Where a decision has to be made on locked rows, the persistence module opens the transaction and hands the rows and a few bound writes to a callback the operation supplies (email finalization, the first installation); it is a local tool for those cases, not a pattern for every write. The logs module has one more: a retry of an email attempt, decided on the locked original of its chain. Its other writes follow the rule above: a staff entry and a first attempt are single inserts, and a completion is one conditional update, read back only when nothing was written.

An operation is not always a `defineAction`. The logs recorders are called by operations that already passed their guard, with the context those hold, so they are plain server-only functions in `operations/`: a second guard would authorize nothing new. What makes them operations is that the workflow is read in them.

The alternatives were a repository or unit-of-work layer, and keeping the lock everywhere "because auth is sensitive". The first adds indirection this template does not need. The second serialized display names behind credential changes while still not covering the provider paths that never took the lock, so it protected less than it appeared to.
