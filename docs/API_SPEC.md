# Splyt — API Specification

> Maintained by the backend-engineer agent. Update after implementing each endpoint.
> Base URL: `/api/v1`

---

## Auth

### POST /auth/register
Register a new user.

**Request:**
```json
{ "email": "string", "password": "string" }
```
**Response 201:**
```json
{ "userId": "string", "email": "string" }
```

### POST /auth/login
Authenticate and receive tokens.

**Request:**
```json
{ "email": "string", "password": "string" }
```
**Response 200:**
```json
{ "accessToken": "string", "refreshToken": "string" }
```

### POST /auth/refresh
Refresh access token.

**Request:**
```json
{ "refreshToken": "string" }
```
**Response 200:**
```json
{ "accessToken": "string" }
```

---

## Card Linking (Plaid)

### GET /plaid/link-token
Generate a Plaid Link token to initiate the card-linking flow.

**Auth:** Required
**Response 200:**
```json
{ "linkToken": "string" }
```

### POST /plaid/exchange-token
Exchange a Plaid public token for a stored access token.

**Auth:** Required
**Request:**
```json
{ "publicToken": "string", "accountId": "string" }
```
**Response 201:**
```json
{ "cardId": "string", "last4": "string", "institution": "string" }
```

### GET /cards
List all linked cards for the authenticated user.

**Auth:** Required
**Response 200:**
```json
[{ "id": "string", "last4": "string", "institution": "string", "createdAt": "string" }]
```

### DELETE /cards/:id
Unlink a card.

**Auth:** Required
**Response 204:** No content

---

## Virtual Card (Stripe Issuing)

### POST /virtual-card
Create the user's virtual card (one per user).

**Auth:** Required
**Response 201:**
```json
{ "cardId": "string", "last4": "string", "balanceCents": 0, "status": "active" }
```

### GET /virtual-card
Fetch virtual card details and current balance.

**Auth:** Required
**Response 200:**
```json
{ "cardId": "string", "last4": "string", "balanceCents": 0, "status": "active" }
```

---

## Split Configuration

### POST /split-config
Set or update the split percentages across linked cards. Percentages must sum to 100.

**Auth:** Required
**Request:**
```json
{
  "splits": [
    { "cardId": "string", "percentage": 60 },
    { "cardId": "string", "percentage": 40 }
  ]
}
```
**Response 200:**
```json
{ "splitConfigId": "string", "splits": [...] }
```

### GET /split-config
Fetch the current split configuration.

**Auth:** Required
**Response 200:**
```json
{ "splitConfigId": "string", "splits": [...] }
```

---

## Top-Up

### POST /topup
Top up the virtual card. Charges each linked card proportionally per split config.

**Auth:** Required
**Request:**
```json
{ "amountCents": 10000 }
```
**Response 200:**
```json
{
  "topupId": "string",
  "amountCents": 10000,
  "status": "success",
  "lineItems": [
    { "cardId": "string", "amountCents": 6000, "status": "charged" },
    { "cardId": "string", "amountCents": 4000, "status": "charged" }
  ]
}
```
**Response 422 (partial failure — rolled back):**
```json
{
  "topupId": "string",
  "status": "rolled_back",
  "error": "Card ending in 4242 declined. All charges reversed."
}
```

### GET /topup/history
Fetch top-up history for the authenticated user.

**Auth:** Required
**Response 200:**
```json
[{
  "topupId": "string",
  "amountCents": 10000,
  "status": "success",
  "createdAt": "string"
}]
```

---

## Error Format

All errors follow this format:
```json
{ "error": "string", "code": "string" }
```

Common error codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `NOT_FOUND`, `CARD_DECLINED`, `SPLIT_PERCENTAGE_INVALID`
