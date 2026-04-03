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
- Phase 2: Auth service — register, login (constant-time), refresh (DB-backed), logout
- Phase 2: Auth routes — POST /auth/register, /login, /refresh, /logout with per-route rate limiting
- Phase 2: Refresh tokens hashed (SHA-256) before DB storage; never stored raw
- Phase 2: Auth test suite (11 tests, all mocked)
- Phase 3: AES-256-GCM encryption utility for Plaid access tokens (random IV, auth tag)
- Phase 3: Card linking service — Plaid link-token, exchange-token, list, delete with Plaid revocation
- Phase 3: Card routes — GET /plaid/link-token, POST /plaid/exchange-token, GET /cards, DELETE /cards/:id
- Phase 3: Card test suite (12 tests) including encrypt round-trip and tamper detection

### Changed
(nothing yet)

### Fixed
(nothing yet)
