# Splyt — Architecture & Decision Log

> Append-only. Never delete entries. Format: [DATE] Decision — Rationale — Owner

---

## Core Architecture
- [INIT] Prepaid float model chosen for V1 — eliminates recovery/chargeback risk; virtual card always funded before merchant transaction — Product
- [INIT] Stripe Issuing chosen for virtual card — mature API, sandbox available, PCI-compliant tokenization — Architect
- [INIT] Plaid chosen for card linking — industry standard for consumer card/bank account linking in North America — Architect
- [INIT] PostgreSQL + Prisma chosen — relational model fits financial data; Prisma provides type-safe migrations — Architect
- [INIT] Money stored as integers (cents) — eliminates float rounding errors in financial calculations — Architect
- [INIT] Top-up charges are sequential with rollback — simpler to reason about than parallel; rollback is deterministic — Architect

## Security Reviews
(Security reviewer will append entries here after each review)

## Open Questions
- What is the Plaid product to use for charging cards — ACH (bank) or card charging? Confirm before implementing top-up.
- Will V1 support debit cards only, or also credit cards via Plaid?
- What is the top-up minimum and maximum (for fraud/limits)?
