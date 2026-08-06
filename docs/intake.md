# AI Intake

## Current behavior

Authenticated owners can submit an instruction, meeting note, transcript, or other text at `/intake`. The web server validates and stores the immutable source record, records only safe metadata in the audit trail, and queues a PostgreSQL-backed extraction run.

The worker claims queued runs using database locking, invokes the deterministic fake provider, validates its versioned structured draft, and stores a review-required proposal. Source text is not returned through the intake listing API and is not written to worker logs or audit metadata.

Each proposed task carries confidence and a source span. Approving a draft creates `ai_proposed` tasks in Inbox; it never publishes automatically. Declining is auditable. Failed runs may be queued for retry by a trusted server workflow. Approved or declined drafts can be placed in trash for 30 days and restored before their retention period ends; the scheduled purge runner is not yet implemented.

## Provider boundary

This phase intentionally uses `DeterministicFakeAiProvider`; it makes tests, local development, and CI independent of external credentials. A live provider adapter is not implemented. Any future adapter must run only in the trusted worker boundary, decrypt credentials there, validate structured output, and preserve the same review requirement.
