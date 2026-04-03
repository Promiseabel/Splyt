# Splyt — Changelog

> Follows Keep a Changelog format (https://keepachangelog.com). Unreleased changes go under [Unreleased].

## [Unreleased]

### Added
- Project initialized
- Claude Code environment configured (.claude/ directory, agents, commands)
- settings.local.json: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1, defaultMode bypassPermissions
- Living documents created: TASKS.md, DECISIONS.md, PROGRESS.md, CHANGELOG.md
- docs/ directory: ARCHITECTURE.md, ADR.md, API_SPEC.md, COMPLIANCE.md stubs
- Phase 1: Node.js + TypeScript project scaffold
- Phase 1: Prisma schema (all V1 tables — users, linked_cards, virtual_cards, split_configs, topups)
- Phase 1: Zod-validated environment config (src/config/env.ts)
- Phase 1: Express app with rate limiting, error handler, health route
- Phase 1: Stripe + Plaid client singletons
- Phase 1: JWT auth middleware
- Phase 1: Jest + ts-jest setup with health check tests
- Phase 1: ESLint (TypeScript) + Prettier config
- Phase 1: .env.example with all required variables documented

### Changed
(nothing yet)

### Fixed
(nothing yet)
