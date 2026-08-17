# AI Intake

## Current behavior

Authenticated owners can submit an instruction, meeting note, transcript, or other text at `/intake`. The project selector is a type-ahead dropdown, can be filtered by stage, and attaches selections as context tags. A separate `Create new projects` choice authorizes new-project proposals. The web server validates and stores the immutable source record, records only safe metadata in the audit trail, and queues a PostgreSQL-backed extraction run.

The worker claims queued runs using database locking, invokes OpenAI when `OPENAI_API_KEY` is configured (or the deterministic fake provider otherwise), validates its versioned structured draft, and stores a review-required proposal. Long sources are split at transcript boundaries, each bounded section repeats the meeting metadata, and up to four sections are extracted concurrently. A failed section is retried as smaller subsegments before the successful results are merged in source order. Exact duplicate outcomes are collapsed with the later version retained so a later assignment or date correction wins. Meeting dates also produce an explicit weekday/date reference for relative-deadline resolution.

If every provider request times out, refuses, or returns invalid output, the worker stores a low-confidence review fallback instead of stranding the source as a failed extraction. The fallback preserves the original source, derives recognizable transcript speaker names where possible, and asks the owner to confirm the action items. It is labelled as a recovery placeholder in the interface, cannot be approved as a real task, and has a one-click retry that requeues the retained source. Intake status refreshes automatically while long transcripts are being processed. On startup the worker safely returns processing runs stale for more than one hour to the durable queue. Source text is returned only to the authenticated owner for the approval/history interface and is never written to worker logs or audit metadata.

Each proposed task can carry its identified assignee and owner/third-party classification along with priority level, value score and rationale, confidence, source evidence, project assignment, schedule, allocated hours, size, descriptions, definition of done, origin, blockers, planning eligibility, planning rationale, and a subtask checklist. Identified participants appear above the approval board. Third-party tasks remain in a separate panel and are not created unless the owner explicitly moves them into their own tasks. Task size is derived from remaining effort: Small up to 0.5 hours, Medium up to 1 hour, Large up to 2 hours, and Mega above 2 hours. Mega work requires a meaningful breakdown before automatic scheduling. The approval view is a project-column Kanban: the owner can add existing project columns, delete proposed work, drag tasks between projects, and edit task fields and blockers before approval. Approving first persists the reviewed proposal, then transactionally creates its projects, owner tasks, dependencies, provenance, and an approval-result record. Approved-history entries open the original source, reviewed proposal, and created-record result.

Whitespace-normalized matching sources are surfaced as possible duplicates but remain separate and are never merged automatically. Declining moves a draft to Trash for 30 days. The owner may restore it to `review_required` before expiry, and the worker runs an idempotent daily purge that deletes the expired draft together with its immutable source and extraction run. Approved drafts remain as history and cannot be restored for duplicate approval.

## Context and learning

Before extraction, the worker retrieves bounded current-project and current-task context plus the most relevant persistent learning events. Manual creations, owner changes to allocation/size/project classification, completion data, and deletions produce learning events. The worker also refreshes a private Markdown memory file and supplies it as reference data. This lets later estimates use prior corrections while the current task list helps avoid duplicate work and match existing projects. It is deliberately small, auditable keyword retrieval rather than an autonomous training pipeline.

## Provider boundary

Tests and CI use `DeterministicFakeAiProvider`, so validation never requires external access. The OpenAI adapter runs only inside the trusted worker, disables provider-side response storage, requests strict structured JSON, and uses low reasoning effort for the latency-sensitive extraction route. It preserves the same schema-validation and human-review requirement. Provider output remains untrusted until validated.

For an owner-approved live acceptance fixture, run:

```shell
pnpm intake:evaluate transcript.txt expected-actions.txt
```

The evaluator expects the normal provider environment, does not print source text, and reports action recall/precision estimates, final-owner accuracy, fixed-date accuracy, failed sections, and rejected/deferred false positives.
