# Splyt — Claude Code Project Memory

## What This Is
Splyt is a consumer fintech app. Users link multiple credit/debit cards and configure a percentage split. When they top up a virtual card, each physical card is charged proportionally. The virtual card (prepaid float) is always funded before merchant transactions. This is V1 only.

## Stack
- Backend: Node.js + TypeScript, Express or Fastify
- Database: PostgreSQL (via Prisma ORM)
- Card Issuing: Stripe Issuing (virtual card creation and management)
- Card Linking: Plaid (link and charge physical cards)
- Auth: JWT + refresh tokens
- Frontend: React Native (iOS + Android) or React (web MVP)
- Hosting: Railway or Render (MVP simplicity)

## Key Commands
- Install: `npm install`
- Dev server: `npm run dev`
- Tests: `npm test`
- Lint: `npm run lint`
- DB migrate: `npx prisma migrate dev`
- DB studio: `npx prisma studio`

## Project Structure
- `src/` — all application source code
- `src/routes/` — API route handlers
- `src/services/` — business logic (split engine, top-up, card management)
- `src/models/` — Prisma schema and DB models
- `prisma/` — migrations and schema
- `docs/` — architecture, API spec, ADR, compliance notes
- `.claude/agents/` — subagent definitions

## Core Business Logic (Never Break This)
1. At top-up time, charge each linked card proportionally by configured split %
2. Only mark the virtual card as funded after ALL card charges succeed
3. If any card charge fails, roll back all successful charges before surfacing error
4. The virtual card balance must always equal the sum of successful top-up amounts
5. Never route a merchant transaction to a physical card directly — only the virtual card

## Critical Gotchas
- Split percentages must sum to exactly 100% — validate server-side, never trust client
- Plaid ACH vs card charging has different timing — be explicit about which is used
- Stripe Issuing sandbox vs live mode — environment variable controls this, never hardcode
- Never log raw card numbers, CVVs, or Plaid tokens — scrub before logging
- All money values are stored and computed in cents (integers), never floats

## Workflow
- Features: explore-plan-implement-test-commit
- Use subagents for: security reviews, isolated research, parallel implementation
- Always run `npm run lint && npm test` before committing
- Commit format: `type(scope): description` (conventional commits)
- Branch naming: `feature/`, `fix/`, `chore/`

## Out of Scope (V1)
- Rewards optimization (V2)
- Smart routing by merchant category (V2/V3)
- Physical card issuance
- Crypto or international cards
