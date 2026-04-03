# Splyt

Splyt is a consumer fintech app that issues a single virtual card backed by multiple physical credit/debit cards. Users configure a percentage split across their linked cards; when they top up the virtual card, each physical card is charged proportionally at top-up time (prepaid float model). The virtual card is always fully funded before any merchant transaction.

## How It Works

1. User links physical cards via Plaid
2. User configures split percentages (must sum to 100%)
3. User tops up the virtual card with a dollar amount
4. Splyt charges each physical card proportionally
5. If all charges succeed, the virtual card balance is credited
6. User spends from the virtual card at any merchant

## Stack

- **Backend**: Node.js + TypeScript, Express/Fastify
- **Database**: PostgreSQL via Prisma ORM
- **Card Issuing**: Stripe Issuing
- **Card Linking**: Plaid
- **Auth**: JWT + refresh tokens
- **Frontend**: React Native / React web
- **Hosting**: Railway or Render

## Getting Started

```bash
npm install
cp .env.example .env   # fill in Stripe and Plaid sandbox keys
npx prisma migrate dev
npm run dev
```

## Development

```bash
npm run dev      # start dev server
npm test         # run tests
npm run lint     # lint and type-check
npx prisma studio  # browse the database
```

## Project Status

This is V1 — prepaid float model only. See `TASKS.md` for current build status and `PROGRESS.md` for a running log of what has been built.

## Scope

**V1 (this repo):** Virtual card + proportional top-up across linked cards.

**Out of scope for V1:** Rewards optimization (V2), smart routing by merchant category (V2/V3), physical card issuance, crypto, international cards.
