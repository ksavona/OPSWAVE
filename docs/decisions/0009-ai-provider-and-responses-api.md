# ADR 0009: AI Provider and Responses API

- Status: Accepted
- Date: 2026-08-04
- Decision owners: @ksavona
- Supersedes: None
- Superseded by: None

## Context

OpsWeave needs schema-constrained intake proposals and optional prioritization assistance without making one vendor authoritative or required for deterministic planning.

## Decision

- Define an internal provider interface in `packages/ai`; domain code never imports a vendor SDK.
- Use a deterministic fake provider for all required development, test, and CI paths.
- Select OpenAI as the first optional live provider and the Responses API for future structured extraction.
- Record `gpt-5.6-sol` as the current configurable default based on official guidance resolved on 2026-08-04. Never hardcode a model into domain rules or historical records.
- Add the official OpenAI JavaScript SDK only when the live adapter is implemented; Phase 0 avoids an unused production dependency.
- Validate every live response against a versioned schema before persistence, retain provider/model/prompt/schema provenance, and require owner approval before publishing drafts.
- Keep required validation free of real credentials, paid calls, or operational content. Live smoke checks are explicit, synthetic, and optional.

## Consequences

### Positive

- Tests are deterministic and available without an account.
- Provider replacement does not change domain contracts.
- Current model configuration can evolve without rewriting persisted provenance.

### Negative

- The internal contract must normalize provider-specific errors and structured-output behavior.
- The default model requires evaluation for quality, cost, latency, and data handling before live release.

## Validation

- Phase 0 fake-provider determinism test.
- Future live adapter tests use a fake transport and schema-invalid, timeout, rate-limit, refusal, and outage scenarios.

## References

- [OpenAI model guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [GPT-5.6 Sol model](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- [Responses API](https://developers.openai.com/api/reference/resources/responses)
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
