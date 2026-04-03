# Splyt — Architecture Decision Records

> Maintained by the architect agent. Append-only — never modify or delete existing entries.
> Format: ## ADR-NNN: Title | Status | Date

---

## ADR-001: Prepaid Float Model for V1

**Status:** Accepted
**Date:** 2026-04-03

### Context
We need to decide how Splyt charges physical cards relative to merchant transactions. Options:
1. Charge at transaction time (real-time split at POS)
2. Prepaid float (top-up funds virtual card in advance; merchant charges virtual card)

### Decision
Use the prepaid float model. Users top up the virtual card; each physical card is charged proportionally at top-up time. The virtual card always has a funded balance before any merchant transaction.

### Consequences
- **Positive:** No risk of failed charges at POS; user experience is predictable; simpler real-time transaction logic
- **Positive:** Virtual card balance is always known in advance; no need for real-time split calculation at POS
- **Negative:** Users must top up in advance; cannot spend beyond current balance
- **Negative:** Float means user capital is tied up in the virtual card

---

## ADR-002: Stripe Issuing for Virtual Card

**Status:** Accepted
**Date:** 2026-04-03

### Context
We need a provider to issue a virtual card that users can spend from at any merchant.

### Decision
Use Stripe Issuing. Stripe provides a mature API for creating and managing virtual cards in sandbox and production, handles PCI compliance, and integrates with the broader Stripe ecosystem.

### Consequences
- **Positive:** Well-documented API, sandbox available, PCI-compliant
- **Positive:** Stripe handles card tokenization — Splyt never sees raw card numbers
- **Negative:** Stripe Issuing has geographic restrictions; confirm availability for target markets before launch

---

## ADR-003: Plaid for Physical Card Linking

**Status:** Accepted
**Date:** 2026-04-03

### Context
We need a way for users to link their existing physical credit/debit cards so Splyt can charge them at top-up time.

### Decision
Use Plaid. Plaid is the industry standard for consumer financial account and card linking in North America. Plaid Link handles the OAuth-style flow; Splyt stores only opaque access tokens.

### Consequences
- **Positive:** Industry standard, well-documented, handles compliance for account linking
- **Negative:** Plaid's product for charging cards (Transfer vs. Auth) needs validation — confirm which product supports card charging vs. ACH before implementation

---

(Architect agent will append additional ADRs here as decisions are made)
