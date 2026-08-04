# Synthetic Data Policy

All tests, fixtures, screenshots, demos, logs, reports, and public examples must use invented data that cannot identify a real person, client, employer, account, or operation.

## Requirements

- Use explicit words such as `synthetic`, `example`, or `fake` in credential and identity fixtures.
- Do not transform production data into fixtures; create fixtures from scratch.
- Do not use real email addresses, API keys, session tokens, client names, project titles, or private URLs.
- Keep fake credentials structurally distinct from real provider credentials when format realism is unnecessary.
- Assert that synthetic secrets do not appear in logs, responses, HTML, snapshots, or encrypted envelopes.
- Review screenshots and browser storage before publishing them.

`packages/testing` is the shared home for deterministic builders. Tests may define a local fixture when sharing it would obscure the scenario.
