import { stripe } from '../lib/stripe';
import { prisma } from '../lib/prisma';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VirtualCardDetails {
  cardId: string;
  stripeCardId: string;
  last4: string;
  expMonth: number;
  expYear: number;
  balanceCents: number;
  status: string;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createVirtualCard(userId: string, email: string): Promise<VirtualCardDetails> {
  const existing = await prisma.virtualCard.findUnique({ where: { userId } });
  if (existing) {
    throw Object.assign(new Error('User already has a virtual card'), {
      code: 'CARD_ALREADY_EXISTS',
    });
  }

  // Create a Stripe Issuing cardholder for the user first
  const cardholder = await stripe.issuing.cardholders.create({
    name: email,
    email,
    type: 'individual',
    status: 'active',
    billing: {
      address: {
        line1: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94111',
        country: 'US',
      },
    },
  });

  // Create the virtual card under that cardholder
  const stripeCard = await stripe.issuing.cards.create({
    cardholder: cardholder.id,
    currency: 'usd',
    type: 'virtual',
    status: 'active',
  });

  const virtualCard = await prisma.virtualCard.create({
    data: {
      userId,
      stripeCardId: stripeCard.id,
      balanceCents: 0,
      status: 'ACTIVE',
    },
  });

  return {
    cardId: virtualCard.id,
    stripeCardId: stripeCard.id,
    last4: stripeCard.last4,
    expMonth: stripeCard.exp_month,
    expYear: stripeCard.exp_year,
    balanceCents: virtualCard.balanceCents,
    status: virtualCard.status,
  };
}

// ─── Get ──────────────────────────────────────────────────────────────────────

export async function getVirtualCard(userId: string): Promise<VirtualCardDetails> {
  const virtualCard = await prisma.virtualCard.findUnique({ where: { userId } });
  if (!virtualCard) {
    throw Object.assign(new Error('No virtual card found'), { code: 'NOT_FOUND' });
  }

  // Fetch live metadata from Stripe (last4, expiry, status)
  const stripeCard = await stripe.issuing.cards.retrieve(virtualCard.stripeCardId);

  return {
    cardId: virtualCard.id,
    stripeCardId: virtualCard.stripeCardId,
    last4: stripeCard.last4,
    expMonth: stripeCard.exp_month,
    expYear: stripeCard.exp_year,
    balanceCents: virtualCard.balanceCents,
    status: virtualCard.status,
  };
}

// ─── Internal: credit balance after successful top-up ─────────────────────────

export async function creditBalance(
  userId: string,
  amountCents: number,
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
): Promise<void> {
  await tx.virtualCard.update({
    where: { userId },
    data: { balanceCents: { increment: amountCents } },
  });
}
