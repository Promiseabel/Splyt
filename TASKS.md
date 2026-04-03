# Splyt — Task Tracker

> Updated by Claude Code agents throughout the build. Format: [STATUS] Task — Agent responsible — Date

## Statuses
- TODO — not started
- IN PROGRESS — actively being worked
- SPECCED — spec written, ready for implementation
- IN REVIEW — security review in progress
- DONE — complete and tested
- BLOCKED — waiting on dependency or decision

---

## Infrastructure & Environment
- [x] DONE — Initialize Node.js + TypeScript project — backend-engineer — 2026-04-03
- [x] DONE — Set up Prisma + PostgreSQL connection — backend-engineer — 2026-04-03
- [x] DONE — Configure Stripe Issuing sandbox — backend-engineer — 2026-04-03
- [x] DONE — Configure Plaid sandbox — backend-engineer — 2026-04-03
- [x] DONE — Set up environment variable management (.env + validation) — backend-engineer — 2026-04-03
- [x] DONE — Configure Jest for testing — backend-engineer — 2026-04-03
- [x] DONE — Set up ESLint + Prettier — backend-engineer — 2026-04-03
- [ ] TODO — Initialize GitHub repo + branch protection rules — (manual)

## Auth
- [x] DONE — POST /auth/register — backend-engineer — 2026-04-03
- [x] DONE — POST /auth/login — backend-engineer — 2026-04-03
- [x] DONE — POST /auth/refresh — backend-engineer — 2026-04-03
- [x] DONE — POST /auth/logout — backend-engineer — 2026-04-03
- [x] DONE — JWT middleware — backend-engineer — 2026-04-03 (Phase 1)

## Card Linking (Plaid)
- [x] DONE — GET /plaid/link-token — backend-engineer — 2026-04-03
- [x] DONE — POST /plaid/exchange-token — backend-engineer — 2026-04-03
- [x] DONE — GET /cards — backend-engineer — 2026-04-03
- [x] DONE — DELETE /cards/:id — backend-engineer — 2026-04-03

## Virtual Card (Stripe Issuing)
- [x] DONE — POST /virtual-card (create) — backend-engineer — 2026-04-03
- [x] DONE — GET /virtual-card (fetch details + balance) — backend-engineer — 2026-04-03

## Split Configuration
- [x] DONE — POST /split-config (set or update split percentages) — backend-engineer — 2026-04-03
- [x] DONE — GET /split-config — backend-engineer — 2026-04-03
- [x] DONE — Validation: percentages must sum to 100 — backend-engineer — 2026-04-03

## Top-Up Engine (Core V1 Logic)
- [x] DONE — POST /topup — backend-engineer — 2026-04-03
- [x] DONE — Split calculation logic (cents, rounding) — backend-engineer — 2026-04-03
- [x] DONE — Sequential charge execution with rollback — backend-engineer — 2026-04-03
- [x] DONE — Virtual card balance update after success — backend-engineer — 2026-04-03
- [x] DONE — Top-up history endpoint GET /topup/history — backend-engineer — 2026-04-03

## Frontend (Web MVP)
- [ ] TODO — Auth screens (register, login) — frontend-engineer
- [ ] TODO — Link cards screen (Plaid Link SDK) — frontend-engineer
- [ ] TODO — Split configuration screen — frontend-engineer
- [ ] TODO — Top-up screen — frontend-engineer
- [ ] TODO — Virtual card dashboard (balance, last transactions) — frontend-engineer

## Security Reviews
- [ ] TODO — Auth routes security review — security-reviewer
- [ ] TODO — Top-up engine security review — security-reviewer
- [ ] TODO — Plaid integration security review — security-reviewer
- [ ] TODO — Stripe integration security review — security-reviewer
