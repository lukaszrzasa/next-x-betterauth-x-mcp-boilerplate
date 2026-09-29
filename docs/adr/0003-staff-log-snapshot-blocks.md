---
status: accepted
---

# Staff log: successful staff actions as snapshot blocks

The staff log records only staff actions that succeeded and changed something. Refused and failed attempts, actions of users on their own account, anonymous flows and sent emails are left out: mixed together they made a log nobody could read, and each needed its own discriminator on every query. Refusals and failures stay in the application log; emails have the email log.

An entry points at its resource by `resource_type` and `resource_id` without a foreign key, so any module can log about its own resources and later ask for their history, while the logs module knows none of their tables. Users are the exception: the acting staff member is a real reference, read live for their current name, because accounts are never deleted.

The message is an array of generic blocks (`text`, `user`, `date`, `url`, `value`), each a snapshot that is complete on its own. The alternative was an action key with parameters and a sentence template resolved on read. Snapshots were chosen because rendering is one loop with no lookups, an entry still reads correctly after the module that wrote it has changed or gone, and adding an action changes nothing in the logs module. The cost is accepted: wording and language are fixed when the entry is written, and a snapshot shows an old name until the reader follows the link.

Entries are append-only, enforced by triggers. The entry is written after the action is confirmed and outside its transaction, because the changes it describes go through the auth provider and Redis and have no transaction to join. When the write fails the action stands and the staff member is told it was not logged.
