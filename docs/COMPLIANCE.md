# Splyt — Compliance Notes

> Maintained by the architect and security-reviewer agents.

---

## PCI DSS Scope

Splyt minimizes PCI DSS scope by ensuring raw card data never passes through Splyt servers:

- **Virtual card (Stripe Issuing):** Stripe handles card issuance and tokenization. Splyt receives only opaque card IDs and metadata (last4, expiry). No PANs, CVVs, or full card numbers are stored or transmitted by Splyt.
- **Physical card linking (Plaid):** Plaid handles the card-linking OAuth flow. Splyt receives only Plaid access tokens (opaque) and account IDs. No raw card numbers are stored.
- **Payment processing:** All charge operations are initiated via Plaid Transfer/Auth APIs using opaque tokens. Splyt never handles raw card data in transit.

**Result:** Splyt operates as a SAQ-A level merchant for PCI DSS purposes (assuming all card data flows remain tokenized).

---

## Data Storage Rules

| Data Type | Stored by Splyt? | Notes |
|---|---|---|
| Raw card numbers (PANs) | NO | Never — Stripe/Plaid tokenize |
| CVV / CVC | NO | Never stored anywhere |
| Plaid access tokens | YES (encrypted) | Encrypted at rest; never logged |
| Stripe card IDs | YES | Opaque — not sensitive |
| User email | YES | Used for auth |
| Password | YES (hashed) | bcrypt hash only |
| Top-up amounts | YES | Stored as integers (cents) |

---

## Logging Rules

- Never log Plaid access tokens
- Never log Stripe card numbers or CVVs
- Never log user passwords (even hashed)
- Mask card IDs in logs to last4 only (e.g., `card_****4242`)
- Structured logging with request IDs; no PII in log messages

---

## Plaid Compliance

- Plaid Link must be used for card/account linking (no manual card entry)
- Plaid access tokens must be stored encrypted
- Plaid data must only be used for the purposes disclosed to users at link time
- Plaid's end-user privacy policy must be linked in the app

---

## Stripe Issuing Compliance

- Stripe Issuing requires KYC (Know Your Customer) for cardholders in production
- Sandbox mode does not require KYC — ensure environment variable controls sandbox vs. live
- Splyt must comply with Stripe's Issuing terms of service before going live

---

## Open Compliance Questions

- What KYC/AML requirements apply for Splyt's use case? (Confirm with legal before launch)
- Is Plaid Transfer or Plaid Auth the correct product for charging cards? (Confirm with Plaid)
- Which jurisdictions will Splyt operate in for V1? (Affects Stripe Issuing availability)
