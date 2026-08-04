# OpsWeave

[![Repository hygiene](https://github.com/ksavona/OPSWAVE/actions/workflows/repository-hygiene.yml/badge.svg)](https://github.com/ksavona/OPSWAVE/actions/workflows/repository-hygiene.yml)

OpsWeave is an early-stage personal operations workspace intended to turn unstructured work into structured, reviewable projects and tasks. The project is being developed as a public example of disciplined AI engineering, operational design, governance, testing, and maintainable software delivery.

> [!IMPORTANT]
> OpsWeave is in pre-implementation planning. There is no runnable application or release yet. Capabilities described below are a product direction, not implemented features.

## Product direction

OpsWeave is intended to provide:

- governed intake of operational notes, messages, and instructions;
- human review before AI-generated proposals become live work;
- project and task views for planning, dependencies, progress, and capacity;
- deterministic prioritisation and scheduling when AI is unavailable;
- explicit auditability, privacy boundaries, and safe handling of credentials; and
- a single-owner, self-hostable operating model.

The initial architecture, technology choices, data model, and security controls will be recorded as public architecture decisions before application features are implemented.

## Repository status

| Area | Status |
|---|---|
| Application source | Not implemented |
| Runtime and package manager | Not selected |
| Automated application tests | Not available |
| Deployment | Not available |
| Public repository governance | Established |
| Repository hygiene validation | Available |

## Repository layout

```text
.
├── .github/              # GitHub workflows and contribution templates
├── docs/                 # Public architecture and decision records
├── scripts/              # Repository-level validation utilities
├── CHANGELOG.md
├── CONTRIBUTING.md
├── README.md
└── SECURITY.md
```

## Getting started

There is no application to install yet. To inspect the repository and run its current hygiene validation:

```bash
git clone https://github.com/ksavona/OPSWAVE.git
cd OPSWAVE
./scripts/check-repository.sh
```

This script validates the public repository structure and prevents private local planning material from being tracked. It is not an application build, test, security audit, or coverage command.

## Documentation

- [Documentation index](docs/README.md)
- [Architecture status](docs/architecture/README.md)
- [Architecture decision records](docs/decisions/README.md)
- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## Contributing

The project is not yet accepting feature implementation without a public issue that defines its scope and acceptance criteria. Documentation, repository-quality, and design feedback are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Security

Do not report suspected vulnerabilities in a public issue. Follow the private process in [SECURITY.md](SECURITY.md).

## License

No open-source license has been selected yet. Until a license is added, the repository is publicly viewable but its contents are not licensed for reuse, modification, or distribution. A license will be selected before application source is published.
