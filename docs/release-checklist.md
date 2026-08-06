# Release Checklist

## Current status

This is a release-preparation checklist, not a production-readiness claim. Do not create a release candidate while any functional phase remains in progress or any required validation is incomplete.

## Required evidence

- Run `pnpm validate` successfully from a clean checkout with the pinned Node.js and pnpm versions.
- Review the generated coverage report and record any accepted gaps in a versioned plan revision.
- Confirm `git status --short` contains no `.env`, `Notes.md`, `AGENT.md`, or `Implementations/` files staged for publication.
- Run the synthetic end-to-end flows for login, settings, projects/tasks, intake, planning preview, and reporting.
- Review the CSV export with formula-like synthetic values and confirm source text, credentials, sessions, hashes, and ciphertext are absent from reports and browser artifacts.
- Verify backup/restore, migration, worker restart, deployment, and rollback procedures in the target environment. These procedures are not yet implemented as supported release workflows.
- Confirm branch protection requires the pinned CI validation workflow before merging to the default branch.

## Current release blockers

- Phase 4 intake retention/purge and duplicate workflows are incomplete.
- Phase 5 durable automation, execution, schedules, undo, and recovery are incomplete.
- Phase 6 dashboard UI, filters, charts, and print layout are incomplete.
- A supported deployment, backup/restore test, and external security assessment have not been completed.
