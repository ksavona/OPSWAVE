# Multi-user Delegation, Anonymous Collaboration, Chatter, and External Access

## Implementation plan

Status: Implemented on `agent/phase-4-ai-intake`; rollout remains feature-flagged
Code baseline reviewed: `c583ce6` (`agent/phase-4-ai-intake`)
Remote restore point: [draft PR #4](https://github.com/ksavona/OPSWAVE/pull/4)
Implementation date: 17 August 2026

## Implementation status

The additive identity, Access Grant, invitation, delegation, private Kanban, task-sharing,
anonymisation, document-audience, activity, notification, timesheet, user-administration,
compliance, worker, and owner-review changes described below are implemented. Existing owner
records and compatibility columns remain in place; no destructive contract migration was used.

Runtime enablement is controlled from Collaboration settings. Invitation email requires the
deployment encryption key and email webhook, and delegate uploads remain fail-closed until the
malware scanner endpoint is configured. These are deployment controls, not replacement API keys;
the existing OpenAI key is reused unchanged.

The original restore point remains available in draft PR #4 history. The implementation commit is
added to the same branch only after the complete unit, integration, lint, formatting, secret,
repository, and production-build checks pass.

### Validation evidence

- 205 unit/component tests pass across 48 files.
- Coverage passes the enforced 80% gates: 91.94% statements, 80.18% branches, 90.82% functions, and 93.30% lines.
- 19 PostgreSQL integration scenarios pass from a zero-schema migration, including invitation expiry, independent grants, immediate revocation, document audiences, notification privacy, retained history, alias isolation, and per-user credential rotation.
- Five Chromium end-to-end scenarios pass against the production build with no application/database errors in the server log.
- Formatting, ESLint, Markdown lint, TypeScript, secret scanning, repository hygiene, production build, license policy, and production dependency audit pass.
- The repository pins Node.js 24.19.0. The validation host currently emits an engine warning under Node.js 22.22.3; deployment must use the pinned runtime.

## 1. Executive recommendation

Implement this as an additive extension of the existing modular monolith. Keep Next.js as the authenticated web/API boundary, PostgreSQL as the system of record, the existing worker for durable background processing, `packages/domain` for permission rules, `packages/db` for persistence, and `packages/ai` for the controlled owner-only AI boundary.

The implementation should be based on five foundations:

1. A unified authenticated `User` and `WorkspaceMembership` model that includes the existing owner and all future delegates. There must not be a second delegate-only authentication system.
2. A dedicated `AccessGrant` as the only authority for task/project delegation. The existing placeholder `delegates` table and singular `tasks.delegate_id` must not become the new authority.
3. A central, server-side authorization and projection layer. Delegate responses must be built from explicit allowlists; the server must not load a complete owner workspace and redact it afterward.
4. The existing immutable audit log as the canonical activity timeline. Messages and log notes may have linked payload records, but every activity must have an immutable `audit_events` record.
5. Durable notification and email outboxes processed by the existing worker, with permission re-checks immediately before delivery.

The safest delivery model is expand, backfill, dual-read/dual-write where needed, cut over behind feature flags, and defer all destructive schema cleanup to a later explicitly approved release.

## 2. Existing implementation assessment

### 2.1 Architecture that should be reused

| Existing area           | Current implementation                                                                                                                      | Reuse decision                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web and API             | Next.js App Router pages and thin route handlers in `apps/web`; services in `apps/web/src/server`                                           | Keep this boundary. Add principal and capability checks before every service operation.                                                                      |
| Background work         | Continuously running `apps/worker`, PostgreSQL claiming/idempotency patterns, bounded polling                                               | Add invitation email, notification delivery, expiry, and compliance jobs to this worker.                                                                     |
| Domain validation       | Zod schemas and framework-independent rules in `packages/domain`                                                                            | Add identity, access, activity, notification, and anonymisation contracts here.                                                                              |
| Persistence             | PostgreSQL 18, Drizzle schema, generated/reviewed additive migrations, integration tests from zero                                          | Keep. Use foreign keys, partial unique indexes, check constraints, and transactional state changes.                                                          |
| Authentication security | Argon2id passwords, opaque cookie sessions, SHA-256 session digests, idle/absolute expiry, same-origin mutation checks, durable rate limits | Generalise this implementation from owner-only credentials/sessions to unified users. Do not replace it with magic links or emailed passwords.               |
| Projects/tasks          | `projects`, `tasks`, stages, nine task lanes including `delegated`, versions, soft deletion/archive, derived metrics                        | Keep these as the only project/task records. Add access and safe delegate projections around them.                                                           |
| Dependencies            | `entity_dependencies` supports task/project cross-type edges and cycle validation                                                           | Reuse, but return only edges whose endpoints the requesting principal may see.                                                                               |
| Timesheets              | `task_time_entries` transactionally recalculates task hours and project metrics                                                             | Extend with authenticated user and alias snapshots; do not build a second timesheet system.                                                                  |
| Documents               | `attachments`, private server storage, 25 MB limit, owner authorization, 90-day terminal retention                                          | Extend with visibility, uploader, selected audience, redacted-copy approval, quarantine, and access checks.                                                  |
| Notes                   | Tiptap rich text with images, links, headings, index, tables, and task lists                                                                | Reuse for authorised notes. Add delegate-safe projections and never expose owner notes by omission-based filtering.                                          |
| Audit                   | `audit_events`, redacted metadata, actor owner, per-entity timeline                                                                         | Make this the canonical Chatter/Activity stream and extend it to unified actors, categories, alias snapshots, mentions, and visibility.                      |
| AI                      | Provider interface, strict JSON schemas, `store: false`, deterministic fakes, worker-owned extraction/planning, owner review                | Keep delegate-facing AI disabled. Add only an owner-controlled background compliance classifier with minimal scoped content.                                 |
| Planning                | Delegated lane already excluded from owner capacity; automation writes are transactional and audited                                        | Add an explicit active-assignment exclusion so delegated work cannot enter owner Today/This Week even if its owner lane is changed accidentally.             |
| UI patterns             | Full-screen Task/Project editors, tabs, right-hand audit panel, Kanban, shared request helper, settings sections                            | Split new features into focused components and replace the audit panel with a unified timeline without enlarging the existing monolithic components further. |

### 2.2 Important current gaps

- Authentication is single-owner. `owners`, `owner_credentials`, `sessions.owner_id`, most service method signatures, and `audit_events.actor_owner_id` assume one owner.
- The owner record has a username but no email. There is no user registration or invitation acceptance flow.
- There are no workspace memberships, admin roles, delegate roles, capability checks, or per-entity access-resolution functions.
- The existing `delegates` table contains only `workspace_id` and `display_name`. `tasks.delegate_id` is singular, is not included in current task records, and cannot support multiple delegates, history, expiry, or authenticated access.
- `WorkService.readWorkspace` returns every active project, task, client name, and dependency in a workspace. This is valid only for an owner and must never be reused for delegate responses.
- Attachments have no uploader, visibility level, selected audience, approval state, scan/quarantine state, or redacted-copy relationship.
- Timesheets have no authenticated user, alias snapshot, access-grant origin, update/version history, or project-only subject.
- Audit events can identify only an owner. The existing UI supports no filters, messages, log notes, mentions, participant audiences, or delegate-safe actor projection.
- There is no notification table, notification UI, email transport, durable email outbox, delivery history, or notification preference model.
- There is no delegated Kanban state. `tasks.workflow_lane` is the owner's only lane, so it cannot represent independent progress for multiple delegates.
- There is no anonymisation flag, alias context, neutral project/task presentation, protected-term list, or document redaction approval workflow.
- Owner-only features are protected only by the fact that every session is currently an owner. Settings, Intake, AI task splitting, Planning, reports, audit reads, attachments, and workspace reads need explicit capabilities before delegate sessions exist.
- The current runtime is documented as not production-ready. External user access requires supported TLS/proxy configuration, a current supported Node runtime, durable backups including attachment storage, email-domain controls, security monitoring, and an upload malware-scanning strategy.

## 3. Non-negotiable design decisions

### 3.1 Unified principal

Every authenticated request must resolve to a `Principal` containing:

- `userId`
- `workspaceId`
- `membershipId`
- workspace role: `owner`, `admin`, or `delegate`
- membership and user lifecycle state
- session ID and authorization version
- owner compatibility ID when the principal is the migrated existing owner

`SessionRecord` should remain as a compatibility type during migration, but new services must receive `Principal`. A session is valid only when the user and membership are active and its authorization version is current.

### 3.2 Access Grant is authoritative

An Access Grant represents one user's access to one Task or Project. It is not an assignment, a task field, or an email-only record. It owns invitation state, role, scope, expiry, alias context, lifecycle, and delegation note.

Task work assignment is related but distinct:

- An Access Grant answers: "May this person access this subject?"
- A Task Assignment answers: "Is this person responsible for delivery or review on this task?"
- A Delegate Task State answers: "Where is this person's copy of the work on their own Kanban?"

Keeping these concepts separate is required for project collaborators who can see several shared tasks but are assigned to only some of them.

### 3.3 Deny by default and project data explicitly

Create separate owner/admin and delegate response types. Delegate projections must select only permitted columns and safe presentation fields at query time. Never serialize a full Project or Task and then delete sensitive fields in JavaScript.

Unknown or inaccessible entity IDs should normally return the same `404` response to prevent record enumeration. Capability denials on an already visible record may return `403` where the distinction is safe and useful.

### 3.4 No authorization cache in the first release

Every protected request and notification delivery must re-check current user state, membership state, grant status, expiry, and subject visibility in PostgreSQL. If caching is introduced later, it must be keyed by an incrementing authorization version and invalidated transactionally.

### 3.5 Audit is the timeline source of truth

Every message, note, mention, timesheet change, document event, delegation event, status/stage change, notification event, automation event, and compliance event creates one immutable audit event. Searchable message bodies can live in a one-to-one payload table, but a payload without its audit event is invalid.

### 3.6 Anonymisation is an approved presentation, not best-effort UI replacement

In anonymised contexts, the delegate receives an owner-approved safe presentation of the Project/Task and approved documents. Automatic pattern masking is defense in depth, not the authority for releasing private content. If a safe presentation or redacted document is missing or stale, sharing is blocked.

## 4. Target data model

All tables and columns below are additive. Existing IDs and history remain.

### 4.1 Unified identity and membership

#### `users`

- `id uuid primary key`
- `email`, `normalized_email` (nullable only for the migrated legacy owner until the owner supplies an email)
- `username`, `normalized_username` for compatibility and optional sign-in
- `full_name`
- `status`: `invited`, `active`, `deactivated`, `archived`
- `authorization_version integer`
- `deactivated_at`, `archived_at`
- `created_at`, `updated_at`
- Partial unique index on non-null `normalized_email`
- Partial unique index on non-null `normalized_username`

#### `user_credentials`

Use the same Argon2id hash, algorithm, parameter, changed-at, and optimistic credential-version fields as `owner_credentials`, keyed by `user_id`.

#### `workspace_memberships`

- `id`, `workspace_id`, `user_id`
- `role`: `owner`, `admin`, `delegate`
- `status`: `invited`, `active`, `deactivated`, `archived`
- lifecycle actor/time fields
- `authorization_version`
- `created_at`, `updated_at`
- Unique `(workspace_id, user_id)`
- Exactly one active owner membership per workspace

#### Compatibility changes

- Add `owners.user_id`, backfill the current owner to a `users` row, and preserve `owners` as the owner-profile compatibility record.
- Backfill `user_credentials` from `owner_credentials`; dual-write owner password changes until every owner auth path uses `user_credentials`.
- Add `sessions.user_id`, `sessions.membership_id`, and `sessions.authorization_version`; backfill existing sessions. Make `owner_id` nullable only after the application can read both forms.
- Add `audit_events.actor_user_id`; backfill from `actor_owner_id` through `owners.user_id`.
- Do not delete `owners`, `owner_credentials`, `sessions.owner_id`, or `audit_events.actor_owner_id` in this implementation.

### 4.2 Access grants and invitations

#### `access_grants`

- `id`, `workspace_id`
- `subject_type`: `project` or `task`
- `subject_project_id` nullable FK and `subject_task_id` nullable FK, with a check matching `subject_type` and requiring exactly one subject
- `delegate_user_id` nullable until a new user accepts
- `delegate_email` and `normalized_delegate_email` as immutable invitation/contact snapshots
- `scope`: `project` or `task`, constrained to the subject type
- `access_role`: `contributor`, `project_collaborator`, `reviewer`
- `status`: `invite_pending`, `active`, `expired`, `declined`, `revoked`
- `invited_at`, `activated_at`, `expires_at`
- `granted_by_user_id`
- `revoked_by_user_id`, `revoked_at`
- `delegation_note`
- `version`, `created_at`, `updated_at`
- A partial unique index preventing more than one pending/active grant for the same subject and normalized email
- A check allowing `project_collaborator` only with project scope

Grant history is retained. Changing a delegate revokes the old grant and creates a new pending grant; it must not rewrite the historical person on an existing grant.

#### `invitation_tokens`

- `id`, `access_grant_id`
- SHA-256 `token_digest`; never store the raw token
- `expires_at`, `consumed_at`, `invalidated_at`
- `created_by_user_id`, `created_at`
- Partial unique index allowing one live token per grant

Resending invalidates all previous live tokens and creates a new one. Invitation links should carry the token in the URL fragment and exchange it through a same-origin POST, so the raw token is not sent in referrers or ordinary request logs.

For durable email delivery, the raw link may exist only as AES-GCM encrypted outbox payload using a deployment key separate from PostgreSQL backups. Erase the ciphertext after successful delivery or permanent cancellation.

### 4.3 Legacy delegation compatibility

Do not repurpose the current `delegates` row as an Access Grant; its semantics are a workspace label, not a per-subject permission. Keep `delegates` and `tasks.delegate_id` readable for compatibility, mark them deprecated in code/docs, and stop new writes to them.

If a deployment contains legacy `tasks.delegate_id` values, create an owner-visible migration report requiring manual email/account mapping. Do not automatically grant access from a display name alone. A later separately approved contract migration may remove the legacy structures after all deployments report zero unresolved rows.

### 4.4 Delegate visibility, assignment, and Kanban

#### Task additions

- `delegate_visibility`: retained for migration compatibility and document/audience policy only; it must not narrow an active Project Access Grant
- `created_by_user_id`
- `owner_work_assigned boolean`, default `true` for current tasks
- `pre_delegation_lane` nullable compatibility/suggestion field

#### `task_delegate_audience`

Legacy compatibility table for explicitly selected Task audiences. Access resolution no longer relies on this table: Project clearance covers every linked Task, while a direct active Task Access Grant covers only that Task.

#### `task_assignments`

- `task_id`, `user_id`, optional `access_grant_id`
- assignment role: `delivery` or `review`
- active/lifecycle fields and creator
- unique active assignment per task/user

#### `delegate_kanban_stages`

- Per membership/user stage definitions with name, sequence, colour, archive/version fields
- Stable semantic kind: `assigned`, `in_progress`, `waiting_for_input`, `ready_for_review`, `complete`, or `custom`
- Seed the five requested default stages on activation

#### `delegate_task_states`

- `task_id`, `user_id`, `task_assignment_id`, `stage_id`
- `latest_update`, `last_activity_at`, `version`, timestamps
- Unique `(task_id, user_id)`

Moving a delegate state never changes `tasks.workflow_lane`. Moving to semantic `ready_for_review` creates an owner notification and audit event and highlights the owner card. The owner task remains in `delegated` until the owner explicitly moves it to Monitor/Validate, Done, or another owner lane.

When the first active delivery assignment is created, transactionally move the owner lane to `delegated` and record the prior lane. When the final assignment ends, do not silently re-enter the task into automated planning; show the owner a suggested restoration action based on `pre_delegation_lane`.

### 4.5 Anonymisation and aliases

Add `anonymise_delegation boolean not null default false` to both `projects` and `tasks`.

Effective anonymisation is:

1. Project flag, when the Task belongs to an anonymised Project.
2. Otherwise the Task flag.
3. A Task cannot override an anonymised Project to false.

#### `delegate_entity_presentations`

One approved delegate-safe projection per Project or Task:

- typed Project/Task FK with exactly-one check
- `source_version`
- safe/neutral title
- safe description/work description/definition of done/notes
- neutral client/project/contact labels as applicable
- `status`: `draft`, `approved`, `stale`, `blocked`
- `approved_by_user_id`, `approved_at`, version/timestamps

The original Project/Task remains the source of truth. Updating an original anonymised field transactionally marks its delegate presentation stale. A stale or missing presentation blocks new delegate display until re-approved.

#### `delegation_aliases`

- `workspace_id`, `user_id`
- context type and typed FK: anonymised Project, task-level anonymised Task, or standalone anonymised Task
- `alias`
- created timestamp and retired timestamp; never delete aliases used by history
- Unique user/context and unique alias/context constraints

Generate aliases with cryptographically secure randomness from reviewed adjective/animal lists plus a three-digit suffix. Retry on the context uniqueness constraint. Context selection is:

- Project context for every Task in an anonymised Project.
- Task context for task-only anonymisation in a normal Project.
- Task context for every standalone Task.

Store alias snapshots on audit events, timesheets, messages, notifications, and compliance flags so historical text remains correct after revocation or later alias policy changes. Never return alias-to-real-user mappings to delegate APIs.

#### Protected terms

Add an owner/admin-only protected-term collection per anonymisation context for client/company names, contacts, email addresses, phone numbers, domains, URLs, and social handles. Use exact/normalised matching and structured regex checks server-side. This supports deterministic quarantine/masking and must never be included in delegate responses or compliance notification emails.

### 4.6 Documents

Extend `attachments` with:

- `uploaded_by_user_id`
- visibility: `internal_only`, `shared_all_delegates`, `shared_selected_delegates`, `redacted_delegate_copy`
- `original_attachment_id` for a separately stored redacted copy
- safe delegate filename and metadata
- approval state/actor/time
- scan state: `pending`, `clean`, `rejected`, `unavailable`
- quarantine state and content hash

Add `attachment_delegate_audience` for selected users or grants.

Rules:

- `internal_only` is never returned to delegates.
- Normal non-anonymised sharing may expose a clean approved original according to audience.
- An anonymised context exposes only a clean, approved `redacted_delegate_copy` with safe filename/metadata.
- Automatic redaction may create a draft copy but can never approve it.
- If file scanning is unavailable, external uploads remain quarantined and delegate upload is disabled rather than silently accepting unsafe files.
- Revocation immediately blocks downloads even when a previous notification contains the URL.
- Existing 90-day Task/Project retention applies to original and redacted copies without breaking their relationship or audit history.

### 4.7 Timesheets

Extend the existing `task_time_entries` table rather than adding a competing timesheet system:

- Make `task_id` nullable only when adding a typed `project_id`; require exactly one Task or Project subject.
- Add `user_id not null` after backfilling every existing row to the migrated owner user.
- Add `access_grant_id` nullable, `actor_alias_snapshot`, `version`, and change timestamps.
- Preserve existing IDs and Task rows.

Create subject-generic store/service methods while retaining old method wrappers during migration.

Rules:

- The authenticated principal is always the `user_id`; clients cannot submit a user ID.
- Delegates can create/update/delete only their own entries while currently authorised.
- Owners/admins can view all permitted entries and correct them through an explicitly audited admin action.
- Revocation never deletes historical entries.
- Every mutation recalculates Task hours/size/breakdown and derived Project metrics in the same transaction and emits an immutable audit event with alias snapshot.
- Direct Project entries contribute to Project spent hours but not to any Task's hours.

### 4.8 Unified activity, mentions, and notifications

Extend `audit_events` with:

- `actor_user_id`
- `actor_alias_snapshot`
- activity category
- `subject_project_id` / `subject_task_id` typed references where possible
- `visibility`: `owner_admin`, `authorised_participants`, `selected_participants`, `actor_and_owner`
- `user_generated boolean`
- optional `occurred_for_user_id` for per-delegate progress events

#### `activity_payloads`

A one-to-one immutable payload for user messages and log notes:

- `audit_event_id primary key`
- kind: `message` or `log_note`
- original body owner/admin visibility
- delegate-safe body when anonymisation applies
- search vector and content status/quarantine state

System logs use the audit metadata already present and cannot be edited or deleted. Add database protections or restricted privileges preventing ordinary application updates/deletes of audit events and activity payloads.

#### `activity_mentions`

- `audit_event_id`, `mentioned_user_id`, `display_alias_snapshot`
- Unique event/user

The client mention picker submits opaque user IDs selected from a server-provided, subject-authorised participant list. The server verifies each user remains authorised and resolves the correct current display name/alias. Never resolve mentions by trusting typed visible text.

#### `notifications`

- recipient user, source audit event, type, state (`unread`, `read`, `dismissed`, `cancelled`)
- safe title/body snapshots appropriate to that recipient
- authorised route descriptor, not an unrestricted URL
- timestamps and uniqueness/idempotency key

#### `notification_outbox`

- notification/invitation reference, channel, template key, encrypted minimal payload where needed
- idempotency key, state, attempt count, next-attempt time, safe error, delivered/cancelled time

The worker must re-resolve recipient access immediately before email delivery. If the user, membership, grant, or subject is no longer accessible, cancel delivery. In anonymised contexts, render only aliases and neutral approved names.

Notification behavior:

- A Message with mentions notifies only the mentioned authorised users.
- A Message without mentions notifies all active authorised participants for that exact subject.
- A Log note notifies nobody unless explicit recipients are selected.
- Owner/admin notifications include ready-for-review, overdue, blocked, at-risk, expiry, revoked/expired access, and compliance flags.

### 4.9 Compliance flags

#### `compliance_flags`

- source audit event or attachment
- Task/Project, delegate user, and alias snapshot
- risk level, categories, concise reason, evidence span/reference
- status: `open`, `dismissed`, `warned`, `restricted`, `revoked`
- model/provider/prompt version when AI contributed
- reviewed/actioned by and timestamps
- owner/admin visibility only

Use two stages:

1. Synchronous deterministic checks for known protected terms, email/phone/URL/social patterns, and obvious external-contact requests. High-confidence identity leakage is stored but quarantined from other delegates pending owner review.
2. Optional owner-controlled background AI classification over only the delegate-created item and minimal neutral context. The model flags risk; it never suspends, accuses, warns, or revokes automatically.

The delegate cannot view model settings, prompts, provider names, classifications, or compliance logs. The worker must use strict structured output, `store: false`, bounded input, deterministic fakes in tests, and no hidden client identity as model context unless it is required and separately protected.

## 5. Authorization model

### 5.1 Baseline capability matrix

| Capability                                                                      | Contributor | Project collaborator | Reviewer           | Owner/admin                 |
| ------------------------------------------------------------------------------- | ----------- | -------------------- | ------------------ | --------------------------- |
| View directly authorised subject                                                | Yes         | Yes                  | Yes                | Yes                         |
| View real identities of other delegates                                         | No          | No                   | No                 | Yes                         |
| View owner-only/client/AI fields                                                | No          | No                   | No                 | Yes                         |
| Update assigned progress fields                                                 | Yes         | Yes                  | No                 | Yes                         |
| Create/edit own delegate-visible subtasks                                       | Yes         | Yes                  | No                 | Yes                         |
| Create Tasks in delegated Project                                               | No          | Yes                  | No                 | Yes                         |
| Create Project records                                                          | No          | No                   | No                 | Yes                         |
| Add Message/Log note                                                            | Yes         | Yes                  | Yes                | Yes                         |
| Upload a permitted document                                                     | Yes         | Yes                  | As configured      | Yes                         |
| Add own timesheets                                                              | Yes         | Yes                  | Yes                | Yes                         |
| Move own delegate Kanban state                                                  | Yes         | Yes                  | Review states only | Yes                         |
| Mark Ready for review                                                           | Yes         | Yes                  | No                 | Yes                         |
| Validate/request changes                                                        | No          | No                   | Yes                | Yes                         |
| Reassign or delegate                                                            | No          | No                   | No                 | Yes                         |
| Delete original Project/Task                                                    | No          | No                   | No                 | Yes                         |
| Access Intake, Planning, reports, AI, settings, prompts, memories, or LLM links | No          | No                   | No                 | Owner/admin capability only |

Use explicit per-operation policies rather than a single broad role comparison. Contributor update payloads must use a delegate-specific schema that allowlists only progress/status, permitted subtasks, messages, documents, own timesheets, and delegate state. The existing full Task/Project update schemas remain owner/admin only.

### 5.2 Access resolution

A Project is delegate-visible only through an active, unexpired Project Access Grant.

A Task is delegate-visible when one of these is true:

- The user has an active, unexpired direct Task Access Grant.
- The user has an active, unexpired Project Access Grant for the Task's parent Project.

Task Assignment is a separate responsibility record and cannot expand visibility. Owners may assign only users who already satisfy one of the clearance rules above. A user who creates a Task under a permitted Project collaborator workflow is transactionally assigned to that Task.

A task-level grant does not reveal the parent Project, unrelated Tasks, Project documents, client name, or participant list. It may receive only a minimal neutral parent-context label required to understand the Task.

Subtasks/checklist items need `created_by_user_id` and `delegate_visible`; parent access alone is not enough for internal-only subtasks.

### 5.3 Immediate revocation

Task revoke, Project revoke, membership deactivation, and user archive run in one transaction that:

- changes lifecycle state and increments authorization versions;
- revokes affected sessions;
- invalidates invitation tokens;
- deactivates relevant task assignments and delegate task states;
- cancels undelivered outbox rows and in-app notification routes;
- creates immutable audit and owner notification events.

Every request checks state and expiry, so access stops even if the expiry worker has not run. The worker later materialises `expired` statuses and notifications idempotently.

Do not hard-delete users by default. A workspace owner may archive the user globally only while this is a single-workspace installation or when policy proves they have authority over every membership; otherwise archive/deactivate only the workspace membership.

## 6. Service and API architecture

### 6.1 New server services

- `PrincipalService`: authenticates a session and resolves unified user/membership state.
- `AuthorizationService`: capability checks and scoped access queries.
- `DelegationService`: grant lifecycle, invitation creation/resend/change/revoke, alias provisioning, and assignment coordination.
- `InvitationService`: anonymous token exchange, existing-user sign-in continuation, new-account setup, and grant activation.
- `DelegateProjectionService`: allowlisted normal/anonymised Task, Project, document, timeline, and notification DTOs.
- `ActivityService`: messages, log notes, mentions, filters, and immutable audit integration.
- `NotificationService`: in-app records and durable outbox creation.
- `UserAdministrationService`: admin listing, deactivation, archive, and session revocation.
- `ComplianceService`: deterministic quarantine and owner review actions.

Keep `OpsWeaveStore` as the compatibility facade, but split the new persistence implementation into focused repository files. The current store is already large; adding all multi-user queries to one file would materially increase regression risk.

### 6.2 Route groups

Add thin routes following the existing handler pattern:

- `/api/delegations` and `/api/delegations/[grantId]`
- `/api/delegations/[grantId]/notify`
- `/api/delegations/[grantId]/resend`
- `/api/delegations/[grantId]/revoke`
- `/api/invitations/exchange`, `/accept`, and `/decline`
- `/api/users` and lifecycle actions
- `/api/projects/[projectId]/delegations`
- `/api/tasks/[taskId]/delegations`
- `/api/delegate/workspace`
- `/api/tasks/[taskId]/delegate-state`
- `/api/projects/[projectId]/activity` and `/api/tasks/[taskId]/activity`
- `/api/activity/[eventId]/review` for owner-only quarantine decisions
- `/api/notifications` and read/dismiss actions
- `/api/attachments/[attachmentId]/audience` and redacted-copy approval
- `/api/compliance/flags` and owner review actions

All mutation routes retain same-origin validation, bounded bodies, Zod validation, safe errors, rate limits where sensitive, and optimistic versions.

### 6.3 Existing routes that must become explicitly owner/admin-only

- all Settings and security administration routes
- Intake submission/review/history
- manual Planning and planning preview
- reports and CSV export
- AI credential operations and AI Task splitting
- Project-stage administration
- dependency administration unless a later policy explicitly allows a narrow delegate action
- original Project/Task delete and unrestricted update routes
- complete workspace, Gantt, dependency-map, and audit queries

Attachments, timesheets, Task updates, and entity activity routes must use subject-specific capabilities rather than workspace-only session checks.

## 7. UI implementation

### 7.1 Owner/admin surfaces

- Add a global `/delegations` area with status/scope/role/expiry filters, search, resend, change delegate, change expiry/role, revoke, deactivate, and archive actions.
- Add a Project `Delegations` tab.
- Add a Task `Delegations` tab with separate Task-level and inherited Project-level sections.
- Use the required table columns: real user name, alias, scope, invited, activated, expires, status, role, actions. Real names render only for owner/admin principals.
- Add `Anonymise delegation` controls and safe-presentation approval workflow to Project and Task editors. Disable the Task control when inherited from its Project and explain why.
- Replace the current right-side Audit panel with a `Chatter / Activity` timeline component supporting category, user/alias, date, text, and user/system filters.
- Add the delegation progress panel beneath the existing Task tabs, with one row per delegate: alias, role, private delegate stage, latest update, time logged, last activity, access/expiry, and owner-only risk flags.
- Add an owner Notifications area/bell with ready-for-review and compliance emphasis.

### 7.2 Delegate surfaces

- Add a role-aware `/delegated` landing page and limited Kanban.
- Seed Assigned, In progress, Waiting for input, Ready for review, and Complete; allow delegates to create/reorder/archive their own custom stages without changing owner lanes.
- Reuse cards/editor primitives only after making them capability-driven. Do not render hidden controls and rely on the API to reject them.
- Provide a limited Task/Project editor containing only safe details, delegate-visible notes/subtasks/documents, Chatter, own/authorised timesheets, and private delegate stage.
- Do not render Settings, Intake, reports, owner Gantt/dependency workspace, automation controls, AI status, planning rationale, LLM links, client selectors, real participant names, or deletion/delegation controls.
- Task-level users get an isolated Task route, not a complete Project workspace response.

### 7.3 Component boundaries

Create focused components rather than continuing to enlarge `workspace.tsx` and `entity-editors.tsx`:

- `delegation-table.tsx`
- `delegation-editor.tsx`
- `anonymisation-controls.tsx`
- `delegate-kanban.tsx`
- `delegation-progress-panel.tsx`
- `activity-timeline.tsx`
- `activity-composer.tsx`
- `mention-picker.tsx`
- `notification-center.tsx`
- `document-sharing-panel.tsx`
- `compliance-review-panel.tsx`

Pass a typed capability set and principal-safe DTOs to shared components. Never pass owner DTOs into delegate components.

## 8. Invitation and account flows

### 8.1 Notify

1. Owner/admin enters email, scope, role, expiry, anonymisation option, and note.
2. Server normalises email, validates subject/role, creates a pending Access Grant and invitation token in one transaction, and writes audit/outbox events.
3. Worker claims the email, re-checks the grant, decrypts only the minimal link payload, sends, records delivery history, and erases encrypted token material.
4. UI shows `Invite pending` and delivery state without exposing the token.

### 8.2 Existing user

1. Invite link opens a neutral acceptance page.
2. User signs in normally.
3. Server requires the authenticated user's normalised email to match the grant email.
4. Single-use token is consumed and the grant activates transactionally.
5. User is redirected to the exact authorised Task/Project route.

### 8.3 New user

1. Valid invite token authorises account setup for the fixed invited email only.
2. User enters name and password; no emailed password is ever generated.
3. Server creates the unified User, credential, membership, and session and activates the grant in one transaction.
4. The token is consumed; replay fails generically.

### 8.4 Security details

- Default invite lifetime: 72 hours; owner may choose a shorter Access Grant expiry independently.
- Rate-limit create, resend, exchange, password setup, and accept actions.
- Set `Referrer-Policy: no-referrer` on invitation/account pages and remove fragment tokens from browser history immediately after exchange.
- Do not reveal whether an email already has an account outside the authenticated owner/admin area.
- A revoked/expired grant, mismatched user, reused token, or inactive membership fails without revealing subject content.

## 9. Chatter and activity behavior

The activity query must combine existing events and new chatter payloads in one stable cursor-paginated stream. Required filter dimensions:

- Messages
- Log notes
- automatic system logs
- timesheets
- delegation activity
- status/Kanban changes
- documents
- compliance flags (owner/admin only)
- user or alias
- date range
- text search
- user-generated versus system-generated

Messages and Log notes are immutable after submission. If correction is needed, create a new event referencing the earlier event. This preserves audit history.

In anonymised contexts:

- Mention suggestions expose aliases only.
- Stored mention recipients use real user IDs; rendered snapshots use aliases.
- Email and in-app notifications use aliases and approved neutral entity names.
- Deterministic protected-term detection either produces a masked delegate-safe copy or quarantines the item for owner review.
- The original body remains owner/admin-only and is never sent to other delegates.

## 10. Planning, progress, and AI integration

### 10.1 Owner capacity

Update automation eligibility to exclude any Task with an active delegate delivery assignment unless `owner_work_assigned` is true. Keep the existing delegated-lane exclusion as defense in depth. Add an explicit exclusion reason such as `delegated_external_capacity` to run results.

Delegated time and completion still contribute to Task and Project progress. They do not consume the owner's working-hour capacity unless the owner has an active delivery assignment.

### 10.2 Alerts

The worker should create idempotent owner notifications for:

- delegated work overdue
- delegate state waiting/blocked beyond a configured threshold
- Task/Project at risk
- Access Grant near expiry and expired
- Ready for review
- open high-risk compliance flag

### 10.3 AI boundary

- Delegates cannot invoke extraction, planning, splitting, provider tests, or compliance AI.
- Delegate DTOs omit LLM links, prompts, rationales not meant for them, memories, provider data, and audit metadata about AI.
- Owner AI operations may use delegated progress only when it is authorised Project/Task context and must preserve grants, aliases, assignments, timesheets, and audit history.
- Compliance AI receives only one delegate-created item plus minimal neutral metadata. Hidden cross-project context and real identities are forbidden.
- Deterministic policy remains authoritative for access, masking, quarantine, notifications, planning exclusion, and enforcement.

## 11. Phased implementation sequence

Each phase should be a separately reviewable pull request with migrations, tests, documentation, and a feature flag. Do not combine identity migration, delegate access, anonymisation, and compliance AI into one release.

### Phase 0 — Contracts, threat model, and regression baseline

Deliverables:

- ADRs for unified identity, Access Grants/authorization, anonymisation/document release, audit/activity, and durable notifications.
- Capability matrix and safe DTO contracts in `packages/domain`.
- Feature flags default off: multi-user, invitation email, delegate uploads, compliance monitor.
- Snapshot the current unit/integration/E2E behavior and add explicit tests proving owner behavior is unchanged when flags are off.
- Update backup/restore documentation to include attachment storage and future email/alias keys.

Exit gate: full current `pnpm validate` passes with no behavior change.

### Phase 1 — Unified users, credentials, memberships, and sessions

Deliverables:

- Add identity/membership tables and compatibility columns.
- Backfill owner user, credential, membership, sessions, audit actors, and existing timesheets.
- Implement `PrincipalService` and migrate login/session/password/revocation flows to unified users while dual-writing owner compatibility fields.
- Add active/deactivated/archived checks and authorization-version session invalidation.
- Keep user registration inaccessible except through a future valid invitation.

Exit gate: existing owner can log in, rotate password, revoke sessions, use every current feature, and restore old data; inactive users cannot authenticate.

### Phase 2 — Central authorization and safe query projections

Deliverables:

- Implement capability policies and `AuthorizationService`.
- Convert existing owner routes to explicit owner/admin capabilities.
- Build scoped Project/Task/document/timesheet/activity query primitives.
- Add negative API tests for delegate denial before enabling delegate UI.
- Ensure Gantt/Mermaid/report/intake/settings/planning data cannot be reached by a delegate principal.

Exit gate: a synthetic delegate session can authenticate but receives no workspace data without a grant and cannot access owner-only endpoints.

### Phase 3 — Access Grants, invitations, email outbox, and user administration

Deliverables:

- Add grants, invitation tokens, lifecycle transactions, user admin, notification/outbox base, and SMTP/provider adapter interface.
- Implement Notify, resend, existing/new account activation, decline, role/expiry change, task/project revoke, workspace deactivate, and archive.
- Add global Delegations UI and basic Project/Task Delegations tabs.
- Add worker token delivery with permission re-check and idempotency.

Exit gate: one subject can have multiple delegates; token expiry/replay/mismatch tests pass; every revoke path stops requests and future deliveries immediately.

### Phase 4 — Task sharing, assignments, delegate Kanban, and owner progress

Deliverables:

- Add task visibility/audience, assignments, delegate stages/states, and default stage seeding.
- Add limited delegate workspace and Task/Project views.
- Add owner delegated-lane transaction, progress panel, ready-for-review event/notification, and rework flow.
- Add planning exclusion by active external assignment.

Exit gate: multiple delegates maintain independent stages; owner lane is not overwritten; daily/weekly planning never schedules externally delegated work unless owner assignment is explicit.

### Phase 5 — Anonymisation and controlled documents

Deliverables:

- Add effective anonymisation rules, alias generation, safe presentations, protected terms, document visibility/audiences, redacted copies, approval, and scan quarantine.
- Add owner controls and stale-presentation workflow.
- Apply safe projections to every delegate page, API, download, notification, timeline, and Mermaid-like visual that is later made delegate-visible.

Exit gate: aliases are stable within and unlinkable across contexts; task-level access cannot infer Project/client/other users; no original document is downloadable in an anonymised context.

### Phase 6 — Unified Chatter/Activity, mentions, and notifications

Deliverables:

- Extend audit actors/categories/visibility and add immutable activity payloads and mentions.
- Replace Task/Project audit panels with filterable Chatter/Activity timelines while preserving all existing events.
- Add alias-aware mention picker, no-mention broadcast rules, in-app Notification center, and durable email delivery.
- Add quarantine behavior for deterministic identity/contact leakage.

Exit gate: recipient sets are exactly the currently authorised participants; log notes are silent by default; historical audit remains visible with the correct historical alias.

### Phase 7 — User-linked timesheets and project accounting

Deliverables:

- Extend/backfill existing time entries, add Project subjects and optimistic updates, and enforce own-entry rules.
- Update Task/Project progress, owner panels, Chatter events, alias snapshots, and revoked-user history.
- Add admin correction audit actions without rewriting the original historical actor.

Exit gate: hours, size, remaining work, and Project totals remain transactionally consistent; revoked/archived users' history remains readable to owner/admin.

### Phase 8 — Compliance monitoring and review workflow

Deliverables:

- Add deterministic scanners, compliance job, strict AI contract/fake, owner-only flags/notifications, and Dismiss/Warn/Restrict/Revoke actions.
- Add text/document metadata/upload monitoring and safe retry/failure handling.
- Ensure flags never automatically accuse or suspend.

Exit gate: synthetic leak/solicitation fixtures generate private review flags, false positives can be dismissed, and no model failure changes access automatically.

### Phase 9 — Hardening, rollout, and operational readiness

Deliverables:

- Multi-principal Playwright matrix and independent security review.
- Supported Node runtime, TLS/proxy verification, CSP/referrer headers, email SPF/DKIM/DMARC, durable backups/restores, attachment scanning, delivery monitoring, and incident runbooks.
- Load/concurrency tests for invite replay, simultaneous grant edits, Chatter pagination, outbox retries, expiry races, and immediate revocation.
- Enable flags for one synthetic pilot Project, then a real opt-in pilot, then general use.

Exit gate: all acceptance criteria pass under the supported deployment topology and a rollback/restore exercise is recorded.

## 12. Test strategy

### 12.1 Unit tests

- Capability matrix for every role/action combination.
- Effective Project/Task anonymisation precedence.
- Alias context and collision behavior.
- Delegate-safe DTO allowlists and protected-term masking.
- Mention resolution and recipient calculation.
- Notification template privacy.
- Planning exclusion for delegated external capacity.
- Compliance deterministic rules and AI schema validation.

### 12.2 PostgreSQL integration tests

- Full migration chain from zero and upgrade from a pre-multi-user fixture.
- Owner/user/credential/session backfill with existing session continuity or deliberate safe rotation.
- Active-grant uniqueness, typed subject constraints, expiry, resend invalidation, and token one-time use.
- Transactional activation/revoke/deactivate/archive and session/outbox invalidation.
- Cross-workspace and inaccessible-subject query rejection.
- Independent Project and Task scope resolution.
- Task audience inheritance and direct-grant precedence.
- Alias consistency/difference requirements and retained snapshots.
- Attachment visibility, selected audiences, redacted copies, scan quarantine, and 90-day retention.
- Timesheet user binding, Project/Task totals, optimistic updates, and historical retention.
- Audit/activity immutability, filters, mentions, and notification idempotency.
- Concurrent ready-for-review, revoke, expiry, and delivery races.

### 12.3 API/service tests

- Anonymous, owner, admin, contributor, collaborator, reviewer, expired, revoked, deactivated, and archived principals.
- Every existing endpoint's owner/admin policy.
- Delegate payloads do not contain client names, real identities, emails, phones, URLs, LLM links, planning internals, internal documents, or unrelated IDs.
- Task-level grant cannot query parent Project or sibling Task APIs.
- Revocation takes effect on the next request with an already issued session cookie.
- Notification delivery re-check cancels inaccessible recipients.

### 12.4 Browser and accessibility tests

- Owner creates two delegates, sends/resends invitations, and manages expiry/role/revoke.
- New and existing user invitation acceptance.
- Project collaborator creates a Task; contributor updates own work; reviewer requests changes.
- Two delegates on one Task see independent Kanbans and aliases, never real identities.
- Ready-for-review owner notification and owner validation flow.
- Normal and anonymised Chatter, mentions, documents, and timesheets.
- Direct Task delegate cannot navigate to Project/sibling/client data.
- Axe scans for invitation, delegate Kanban, Delegations table, timeline, notifications, and compliance review.
- Existing Project/Task/Intake/Planning flows remain covered unchanged.

### 12.5 Security tests

- Token entropy/digest-only storage, replay, expiry, resend, fixation, and brute-force rate limits.
- CSRF/origin controls on anonymous exchange and authenticated mutations.
- Session invalidation for all revocation levels.
- IDOR tests for every Task/Project/document/timesheet/activity/notification route.
- Stored XSS and unsafe URL tests in safe presentations, Chatter, filenames, notes, and notification bodies.
- Alias-correlation tests across Projects/Tasks and timing/error side-channel checks.
- File content-type spoofing, path traversal, malware quarantine, oversized/decompression-bomb handling, and redacted-copy isolation.
- Prompt injection tests proving delegate content cannot change AI authority or reveal hidden context.

Required tests and CI must remain external-service-free and use synthetic identities/content only.

## 13. Migration, deployment, and rollback plan

### 13.1 Before every migration release

- Tag/commit the deployable application and record the migration journal.
- Back up PostgreSQL and attachment storage together; keep encryption keys separately.
- Exercise restoration in an isolated environment.
- Run the migration integration suite against both an empty database and a sanitised pre-feature snapshot.
- Confirm old application code can continue operating during the expand/backfill steps or require a documented maintenance window.

### 13.2 Expand and cutover

1. Deploy additive schema with flags off.
2. Run idempotent backfill and reconciliation reports.
3. Deploy dual-read/dual-write code for owner compatibility.
4. Verify owner behavior and data counts.
5. Enable internal synthetic principals only.
6. Enable invitation email for a synthetic address/domain.
7. Enable delegate access for one pilot subject.
8. Enable anonymisation/documents, then Chatter/notifications, then compliance independently.

### 13.3 Rollback

- Turning off feature flags must immediately restore owner-only navigation and block all delegate entry points without deleting data.
- Keep additive tables/columns during rollback; forward-fix schema rather than attempting destructive down migrations.
- Disable notification/compliance workers independently and preserve queued rows for inspection.
- If identity/session cutover fails, use the compatibility owner credential/session path and revoke delegate sessions.
- Catastrophic rollback restores the matched code commit, PostgreSQL dump, attachment backup, and separately held keys.

No legacy column/table removal belongs in the initial multi-user implementation.

## 14. Observability and operations

- Structured counters for invitation creation/delivery/acceptance/failure, active/expired/revoked grants, permission denials, session revocations, notification delivery, compliance backlog, quarantined uploads, and worker lag.
- Correlation IDs connecting Access Grant changes, invitation tokens, audit events, notifications, and outbox attempts without logging tokens or sensitive message bodies.
- Alerts for outbox retry exhaustion, expiry backlog, repeated token failures, unexpected delegate access denials, malware scanner unavailable, compliance queue delay, and authorization query errors.
- Logs must redact email local parts where not operationally required, tokens, protected terms, real/alias mappings, message bodies, document content, credentials, and provider payloads.
- Owner/admin audit views should show safe operational failure categories, never raw provider/email server responses containing secrets or recipient data.

## 15. Acceptance traceability

The implementation is not complete until automated tests demonstrate all of these outcomes:

- Multiple Task and Project delegates with independent grant status, role, expiry, alias, notifications, and history.
- New-account and existing-account secure invitation acceptance with no duplicate account and no emailed password.
- Independent Task and Project scopes, including inherited Project delegates shown separately in the Task editor.
- Immediate Task revoke, Project revoke, workspace deactivation, and archive behavior across sessions, downloads, notifications, APIs, and caches.
- Historical timesheets/messages/audit/alias snapshots retained after access ends.
- Alias consistency within an anonymised Project and non-correlation across different Projects or task-only contexts.
- Client/company/contact identity absent from delegate UI, email, Chatter, documents, metadata, timelines, and notifications.
- Original documents never exposed when a redacted approved copy is required.
- Unified filterable Chatter/Audit Timeline containing old and new events.
- Alias-aware mentions notify exactly the intended authorised users; broadcasts never cross subject access boundaries.
- Owner lane stays Delegated while each delegate has an independent stage; Ready for review alerts the owner.
- Delegated effort updates Task/Project progress but is excluded from owner capacity unless owner assignment is explicit.
- Delegates cannot access any user-facing AI, Intake, planning, provider, prompt, memory, automation, or AI-log functionality.
- Compliance flags remain private and require an owner/admin decision.
- Existing owner Project, Task, Kanban, dependency, Gantt, Mermaid, notes, attachment retention, intake, planning, reporting, settings, audit, and AI flows pass without regression.

## 16. Likely files and modules affected

### Domain

- New `packages/domain/src/identity.ts`
- New `packages/domain/src/access.ts`
- New `packages/domain/src/delegation.ts`
- New `packages/domain/src/activity.ts`
- New `packages/domain/src/notifications.ts`
- New `packages/domain/src/anonymisation.ts`
- Updates to work, planning, security redaction, reporting, exports, and tests

### Database

- Additive changes in `packages/db/src/schema.ts`
- New focused identity/access/activity/notification repositories with `OpsWeaveStore` compatibility methods
- Generated migrations and snapshots
- Expanded migration/integration tests and backfill reconciliation commands

### Web/server

- Principal/auth migration and centralized policy service
- Delegation, invitation, projection, activity, notification, user-admin, and compliance services
- Thin route handlers and role-aware page layouts
- Explicit owner/admin guards on every current privileged route

### Web/UI

- Global Delegations and Notifications areas
- Invitation/account setup screens
- Task/Project Delegations, anonymisation, document sharing, Chatter, and progress components
- Limited delegate workspace and private Kanban
- Capability-driven editor/card primitives

### Worker/AI

- Durable email/notification outbox processing
- Access expiry and alert jobs
- Attachment scan/redaction workflow hooks
- Controlled compliance classifier and deterministic fake
- Updated automation exclusion and delegated-risk alerts

### Documentation/operations

- Authentication, security/threat model, data flow, invitations, permissions, anonymisation, document policy, notification delivery, compliance review, deployment, backup/restore, incident response, and test documentation

## 17. Recorded implementation and operational decisions

- Invitation delivery uses a durable encrypted outbox plus a server-side authenticated webhook adapter. Without the deployment key/webhook, invitations remain manual copy-link delivery.
- Delegate uploads are workspace-controlled and remain unavailable unless the malware scanner endpoint is configured and returns an explicit clean decision.
- Invitation links expire after 72 hours. Grant expiry is optional and owner/admin controlled.
- The current one-workspace model archives the user's membership/account together while preserving identity and history; a future multi-workspace contract migration must split those lifecycle semantics.
- Delegate uploads are controlled by the workspace-level upload flag and current subject access; reviewers remain unable to create/reassign delivery work.
- Owner alerts are materialised idempotently for overdue work, Waiting for input beyond 24 hours, Ready for review, and grants expiring within 48 hours.
- The reviewed adjective/animal generator produces a random three-digit contextual alias. Neutral safe-presentation labels are owner-approved before release.

## 18. Implemented release sequence

The implementation followed the planned expand-first sequence: restore point, additive schema and owner backfill, unified authentication, central authorization, invitations/grants, private delegate workspace, anonymised projections/documents, Chatter/timesheets/notifications, compliance and workers, then UI integration and regression validation. Feature flags remain available for controlled rollout; no destructive legacy cleanup is included.
