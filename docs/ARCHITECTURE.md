# Splyt — System Architecture

> This document is maintained by the architect agent. Update after any significant architectural decision.

---

## Overview

Splyt is a prepaid virtual card platform. Users fund a virtual card by splitting a top-up amount across multiple linked physical cards. The virtual card is issued via Stripe Issuing; physical cards are linked and charged via Plaid.

```
User
 │
 ├─ Links physical cards (Plaid Link)
 ├─ Configures split %
 └─ Initiates top-up
        │
        ▼
   Splyt API (Node.js + TypeScript)
        │
        ├─ Validates split percentages sum to 100
        ├─ Calculates per-card charge amounts (cents)
        ├─ Charges each physical card sequentially (Plaid)
        │    └─ On any failure: rollback all prior charges
        └─ Credits virtual card balance (Stripe Issuing)
               │
               ▼
         User spends at merchant via virtual card
```

---

## Components

### Backend API
- Runtime: Node.js + TypeScript
- Framework: Express or Fastify (TBD — see ADR)
- Auth: JWT access tokens + refresh tokens
- Validation: Zod (schema validation for all request bodies)

### Database
- Engine: PostgreSQL
- ORM: Prisma
- All monetary values stored as integers (cents)

### Card Issuing — Stripe Issuing
- Creates and manages the user's virtual card
- Handles merchant transactions
- Splyt never sees raw card numbers — Stripe tokenizes everything

### Card Linking — Plaid
- Users link physical cards via Plaid Link (OAuth-based flow)
- Plaid provides access tokens for charging linked cards
- Plaid tokens stored encrypted; never logged

### Frontend
- React Native (iOS + Android) or React web for MVP
- Uses Plaid Link SDK for card linking
- All currency displayed in dollars; computed and stored in cents

---

## Data Model (Draft)

```
users
  id, email, password_hash, created_at

linked_cards
  id, user_id, plaid_access_token (encrypted), plaid_account_id,
  last4, institution_name, created_at

virtual_cards
  id, user_id, stripe_card_id, balance_cents, status, created_at

split_configs
  id, user_id, created_at, updated_at

split_config_items
  id, split_config_id, linked_card_id, percentage

topups
  id, user_id, amount_cents, status (pending/success/failed/rolled_back),
  created_at

topup_line_items
  id, topup_id, linked_card_id, amount_cents,
  status (pending/charged/refunded/failed), plaid_transfer_id
```

---

## Key Invariants

1. `split_config_items.percentage` values for a user must sum to exactly 100
2. `virtual_cards.balance_cents` must equal the sum of all successful `topups.amount_cents`
3. A `topup` is only marked `success` after all `topup_line_items` are `charged`
4. Any `topup_line_item` failure triggers reversal of all prior `charged` items for that topup
5. No raw card data (PANs, CVVs) ever stored in Splyt's database

---

## Security Boundaries

- PCI DSS scope is minimized: Splyt never handles raw card numbers
- Plaid access tokens are stored encrypted at rest
- All API endpoints (except /auth/register and /auth/login) require JWT auth
- Rate limiting applied to all auth endpoints

---

## Out of Scope (V1)
- MCC-based routing (V2)
- Rewards optimization (V2/V3)
- Physical card issuance
- Multi-currency support
