# Delegation and Collaboration

OpsWeave uses unified users and workspace memberships. An Access Grant authorises one user for one Task or Project, while Task Assignments and each delegate's private Kanban state remain separate. Access is denied by default and is re-evaluated in PostgreSQL on every protected request.

Owners manage grants from **Delegations** or from a Task/Project Delegations tab. Invitations are single-use and time-limited. Resending invalidates the previous link; decline, revoke, expiry, deactivation, and archive invalidate outstanding links, queued delivery, scoped assignments, and active sessions. Email delivery is optional: without a configured transport the UI returns a copyable secure link.

Project grants do not expose every Task automatically. Each Task is explicitly set to direct delegates only, all active Project delegates, or selected Project delegates. Project collaborators may create scoped Tasks. Contributors and project collaborators may create and edit only their own delegate-visible subtasks; owner-created subtasks require the owner to enable **Delegate access**. Reviewers can comment, log permitted time, and use review/request-change stages, but cannot create delivery work or mark it ready for delivery review.

The delegate workspace uses safe query-time projections. In anonymised work, approved safe Project/Task presentations and neutral filenames are release gates. Original documents are not exposed when a redacted copy is required. Selected document audiences are explicit. Delegate uploads are globally owner-controlled and fail closed unless the configured malware scanner confirms `{"clean":true}` before storage.

Chatter and operational logs share the immutable audit timeline. Mentions and broadcasts resolve only current authorised participants. Timesheets bind to the authenticated user, preserve alias snapshots, and update Task/Project totals without changing the owner's capacity unless owner work is explicitly assigned.

The optional compliance monitor first quarantines deterministic contact or protected-identity leaks. Approved delegate-created messages, notes, and document metadata can be classified in the worker using one bounded item, a neutral subject label, strict structured output, and provider storage disabled. Results remain private owner-review flags. The model never warns, restricts, or revokes access; only an owner action can dismiss, warn, restrict, or revoke.
