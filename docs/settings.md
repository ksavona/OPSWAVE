# Settings

The authenticated `/settings` workspace contains six sections.

## General

General settings store the workspace display name, the owner's full name and known-as aliases, IANA timezone, date display preference, and future landing/sort defaults. Owner identity is supplied to intake as reference data so meeting actions can be separated from other participants' commitments. Updates use an optimistic version; a stale browser receives a conflict instead of silently overwriting newer settings.

## Working Time

Each weekday is one Day / Start / End / Hours row with an independent enabled state. Hours are a read-only calculation of the start/end window. The UI previews raw weekly hours, planning buffer, effective hours, and the explicit no-capacity state. The server validates exactly seven unique weekdays, derives authoritative hours from each enabled window, and uses those windows to constrain Gantt rescheduling.

## Projects

Project configuration manages the Kanban stages, their sequence, human description, and optional LLM matching context. Moving this configuration out of the board keeps operational card interactions focused.

## AI

Required development and validation use deterministic fake credential outcomes. The worker can make live intake calls only when its environment contains `OPENAI_API_KEY`.

- If `OPENAI_API_KEY` is present, Settings reports an environment-managed, read-only status and never returns the value.
- Otherwise, a settings-managed fake-provider credential may be added, replaced, tested, or removed. It is encrypted with AES-256-GCM before PostgreSQL persistence and the input is cleared after submission.
- Browser/API responses expose only configuration and verification status. Wrong or missing master keys fail closed without blocking non-AI settings.

Synthetic verifier prefixes are test/development behavior: `synthetic-valid-`, `synthetic-invalid-`, and `synthetic-rate-limited-`. Other values produce an unavailable result.

## Prioritisation

The section stores bounded planning buffer, deadline horizon, daily size quotas, carryover/overflow policy, and live weekly/daily automation controls. New and migrated workspaces enable the weekly and daily schedules requested for the Kanban. The protected planning-preview mutation records the exact settings snapshot it uses, while each durable automation run records its own settings snapshot and local schedule date.

## Security

Security displays bounded owner/session metadata, changes the password with confirmation, and revokes other sessions. Password and provider actions use the sensitive-action limiter and write redacted audit metadata.
