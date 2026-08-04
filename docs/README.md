# Documentation

This directory contains durable public documentation for OpsWeave. Documents must describe repository evidence accurately and clearly label proposed decisions or planned behavior.

## Index

- [Architecture status](architecture/README.md) — current system state and provisional boundaries.
- [Architecture decision records](decisions/README.md) — how consequential technical decisions will be recorded.
- [ADR template](decisions/0000-template.md) — required structure for new decisions.

Future implementation should add focused documentation for setup, configuration, architecture and data flow, testing and coverage, APIs, security and privacy, deployment, backup and recovery, and operations as those capabilities become real.

## Documentation rules

- Do not claim a feature exists until its implementation and validation are present.
- Use verified commands only.
- Keep examples synthetic and free of credentials or identifying data.
- Update documentation in the same change as the behavior it describes.
- Preserve accepted architecture decisions; supersede them with a new record instead of rewriting history.
