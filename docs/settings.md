# Settings

The authenticated `/settings` workspace contains five sections.

## General

General settings store the workspace display name, IANA timezone, date display preference, and future landing/sort defaults. Updates use an optimistic version; a stale browser receives a conflict instead of silently overwriting newer settings.

## Working Time

Each weekday has an independent enabled state and decimal hours from 0 through 24. The UI previews raw weekly hours, planning buffer, effective hours, and the explicit no-capacity state. The server validates exactly seven unique weekdays and calculates the authoritative preview.

## AI

Phase 1 does not make live provider calls. Required development and validation use deterministic fake credential outcomes.

- If `OPENAI_API_KEY` is present, Settings reports an environment-managed, read-only status and never returns the value.
- Otherwise, a settings-managed fake-provider credential may be added, replaced, tested, or removed. It is encrypted with AES-256-GCM before PostgreSQL persistence and the input is cleared after submission.
- Browser/API responses expose only configuration and verification status. Wrong or missing master keys fail closed without blocking non-AI settings.

Synthetic verifier prefixes are test/development behavior: `synthetic-valid-`, `synthetic-invalid-`, and `synthetic-rate-limited-`. Other values produce an unavailable result.

## Prioritisation

The section stores bounded planning buffer, deadline horizon, daily size quotas, carryover/overflow policy, and disabled-by-default future automation/AI flags. Persisted configuration does not imply that Phase 2+ planning or automation workflows exist.

## Security

Security displays bounded owner/session metadata, changes the password with confirmation, and revokes other sessions. Password and provider actions use the sensitive-action limiter and write redacted audit metadata.
