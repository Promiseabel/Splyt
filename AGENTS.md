# Splyt — Agent Guide

This file serves as the universal fallback for AI tools that read AGENTS.md instead of CLAUDE.md.

## What This Project Is
Splyt is a consumer fintech app where users split spending across multiple physical cards via a single prepaid virtual card. V1 only — no rewards routing, no smart splitting.

## Agent Roles (defined in .claude/agents/)

| Agent | File | Responsibility |
|---|---|---|
| pm-spec | `.claude/agents/pm-spec.md` | Product specs, user stories, acceptance criteria |
| architect | `.claude/agents/architect.md` | System design, ADRs, architecture decisions |
| backend-engineer | `.claude/agents/backend-engineer.md` | Node.js/TypeScript API, Prisma, Stripe, Plaid |
| frontend-engineer | `.claude/agents/frontend-engineer.md` | React Native / React web UI |
| security-reviewer | `.claude/agents/security-reviewer.md` | Read-only security analysis |

## Slash Commands (defined in .claude/commands/)

| Command | Purpose |
|---|---|
| `/plan-feature <name>` | Spec → architecture → implementation plan → TASKS.md |
| `/security-review <file/feature>` | Run security-reviewer agent on target |

## Core Rules (all agents must follow)
1. Money is always integers in cents — never floats
2. No raw card data on Splyt servers — tokenization via Stripe/Plaid only
3. Top-up charges are sequential with full rollback on any failure
4. Split percentages must sum to exactly 100 — validate server-side
5. Never hardcode secrets — environment variables only
6. Never log card numbers, CVVs, or Plaid tokens
7. Update TASKS.md, PROGRESS.md, and CHANGELOG.md after completing each task
8. Run `npm run lint && npm test` before every commit

## Key Files
- `TASKS.md` — live task tracker
- `DECISIONS.md` — architecture decision log
- `PROGRESS.md` — build progress log
- `CHANGELOG.md` — changelog
- `docs/ARCHITECTURE.md` — system architecture
- `docs/API_SPEC.md` — REST API specification
- `docs/ADR.md` — architecture decision records
- `docs/COMPLIANCE.md` — PCI DSS and compliance notes
