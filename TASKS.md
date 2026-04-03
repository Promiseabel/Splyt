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
- [ ] TODO — Initialize Node.js + TypeScript project — backend-engineer
- [ ] TODO — Set up Prisma + PostgreSQL connection — backend-engineer
- [ ] TODO — Configure Stripe Issuing sandbox — backend-engineer
- [ ] TODO — Configure Plaid sandbox — backend-engineer
- [ ] TODO — Set up environment variable management (.env + validation) — backend-engineer
- [ ] TODO — Configure Jest for testing — backend-engineer
- [ ] TODO — Set up ESLint + Prettier — backend-engineer
- [ ] TODO — Initialize GitHub repo + branch protection rules — (manual)

## Auth
- [ ] TODO — POST /auth/register — backend-engineer
- [ ] TODO — POST /auth/login — backend-engineer
- [ ] TODO — POST /auth/refresh — backend-engineer
- [ ] TODO — JWT middleware — backend-engineer

## Card Linking (Plaid)
- [ ] TODO — GET /plaid/link-token — backend-engineer
- [ ] TODO — POST /plaid/exchange-token — backend-engineer
- [ ] TODO — GET /cards — backend-engineer
- [ ] TODO — DELETE /cards/:id — backend-engineer

## Virtual Card (Stripe Issuing)
- [ ] TODO — POST /virtual-card (create) — backend-engineer
- [ ] TODO — GET /virtual-card (fetch details + balance) — backend-engineer

## Split Configuration
- [ ] TODO — POST /split-config (set or update split percentages) — backend-engineer
- [ ] TODO — GET /split-config — backend-engineer
- [ ] TODO — Validation: percentages must sum to 100 — backend-engineer

## Top-Up Engine (Core V1 Logic)
- [ ] TODO — POST /topup — backend-engineer
- [ ] TODO — Split calculation logic (cents, rounding) — backend-engineer
- [ ] TODO — Sequential charge execution with rollback — backend-engineer
- [ ] TODO — Virtual card balance update after success — backend-engineer
- [ ] TODO — Top-up history endpoint GET /topup/history — backend-engineer

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
