import { prisma } from '../lib/prisma';
import { plaidClient } from '../lib/plaid';
import { decrypt } from '../lib/encrypt';
import { getSplitsForTopup } from './splitConfig.service';
import { calculateCharges } from './splitCalculator';
import { TransferType, TransferNetwork, ACHClass } from 'plaid';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TopupLineItemResult {
  cardId: string;
  amountCents: number;
  status: string;
}

export interface TopupResult {
  topupId: string;
  amountCents: number;
  status: string;
  lineItems: TopupLineItemResult[];
  error?: string;
}

export interface TopupHistoryItem {
  topupId: string;
  amountCents: number;
  status: string;
  createdAt: Date;
}

// ─── Plaid Transfer helpers ───────────────────────────────────────────────────

/**
 * Initiates a Plaid Transfer debit from a linked account.
 * Returns the Plaid transfer ID for later cancellation if needed.
 * Never logs the access token.
 */
async function plaidDebit(
  accessToken: string,
  accountId: string,
  amountCents: number,
  description: string,
): Promise<string> {
  // Plaid Transfer amounts are strings in dollar format
  const amountStr = (amountCents / 100).toFixed(2);

  const response = await plaidClient.transferCreate({
    access_token: accessToken,
    account_id: accountId,
    type: TransferType.Debit,
    network: TransferNetwork.Ach,
    amount: amountStr,
    ach_class: ACHClass.Ppd,
    description,
    user: { legal_name: 'Splyt User' },
  });

  return response.data.transfer.id;
}

/**
 * Cancels a Plaid Transfer that was initiated but not yet settled.
 * Best-effort — logs a warning on failure but does not rethrow.
 */
async function plaidCancel(transferId: string, cardLast4: string): Promise<void> {
  try {
    await plaidClient.transferCancel({ transfer_id: transferId });
  } catch (err) {
    console.warn(
      `[topup] Failed to cancel Plaid transfer ${transferId} for card ****${cardLast4}: ${(err as Error).message}`,
    );
  }
}

// ─── Core top-up engine ───────────────────────────────────────────────────────

export async function executeTopup(userId: string, amountCents: number): Promise<TopupResult> {
  // 1. Guard: virtual card must exist
  const virtualCard = await prisma.virtualCard.findUnique({ where: { userId } });
  if (!virtualCard) {
    throw Object.assign(new Error('No virtual card found — create one before topping up'), {
      code: 'NO_VIRTUAL_CARD',
    });
  }
  if (virtualCard.status !== 'ACTIVE') {
    throw Object.assign(new Error('Virtual card is not active'), { code: 'CARD_NOT_ACTIVE' });
  }

  // 2. Fetch split config (throws NO_SPLIT_CONFIG if not set)
  const splits = await getSplitsForTopup(userId);

  // 3. Calculate per-card charges (integer cents, remainder to largest share)
  const allocations = calculateCharges(
    amountCents,
    splits.map((s) => ({ cardId: s.cardId, percentage: s.percentage })),
  );

  // Build a lookup for encrypted tokens
  const tokenMap = new Map(splits.map((s) => [s.cardId, s.plaidAccessTokenEnc]));

  // 4. Create topup record in PENDING state
  const topup = await prisma.topup.create({
    data: {
      userId,
      amountCents,
      status: 'PENDING',
      lineItems: {
        create: allocations.map((a) => ({
          linkedCardId: a.cardId,
          amountCents: a.amountCents,
          status: 'PENDING',
        })),
      },
    },
    include: { lineItems: true },
  });

  // 5. Sequential charge loop with rollback on failure
  const charged: Array<{ lineItemId: string; transferId: string; cardLast4: string }> = [];

  for (const lineItem of topup.lineItems) {
    const encToken = tokenMap.get(lineItem.linkedCardId);
    if (!encToken) {
      // Defensive — split config and line items were built from the same source
      await rollback(topup.id, charged, 'Internal error: missing token for card');
      return buildRolledBackResult(topup.id, amountCents, topup.lineItems, 'Internal configuration error');
    }

    // Fetch last4 for logging (masked — never the full number)
    const card = await prisma.linkedCard.findUnique({
      where: { id: lineItem.linkedCardId },
      select: { last4: true, plaidAccountId: true },
    });

    try {
      const accessToken = decrypt(encToken);
      const transferId = await plaidDebit(
        accessToken,
        card?.plaidAccountId ?? '',
        lineItem.amountCents,
        `Splyt top-up ${topup.id}`,
      );

      // Mark line item as CHARGED
      await prisma.topupLineItem.update({
        where: { id: lineItem.id },
        data: { status: 'CHARGED', plaidTransferId: transferId },
      });

      charged.push({ lineItemId: lineItem.id, transferId, cardLast4: card?.last4 ?? '????' });
    } catch (err) {
      console.warn(
        `[topup] Charge failed for card ****${card?.last4 ?? '????'} on topup ${topup.id}: ${(err as Error).message}`,
      );

      // Mark this line item as FAILED
      await prisma.topupLineItem.update({
        where: { id: lineItem.id },
        data: { status: 'FAILED' },
      });

      // Roll back all previously successful charges
      await rollback(topup.id, charged, (err as Error).message);
      return buildRolledBackResult(
        topup.id,
        amountCents,
        topup.lineItems,
        `Card ending in ${card?.last4 ?? '????'} declined. All charges reversed.`,
      );
    }
  }

  // 6. All charges succeeded — credit balance and mark topup SUCCESS atomically
  await prisma.$transaction(async (tx) => {
    await tx.topup.update({ where: { id: topup.id }, data: { status: 'SUCCESS' } });
    await tx.virtualCard.update({
      where: { userId },
      data: { balanceCents: { increment: amountCents } },
    });
  });

  const finalLineItems = await prisma.topupLineItem.findMany({ where: { topupId: topup.id } });

  return {
    topupId: topup.id,
    amountCents,
    status: 'SUCCESS',
    lineItems: finalLineItems.map((li) => ({
      cardId: li.linkedCardId,
      amountCents: li.amountCents,
      status: li.status,
    })),
  };
}

// ─── Rollback helper ──────────────────────────────────────────────────────────

async function rollback(
  topupId: string,
  charged: Array<{ lineItemId: string; transferId: string; cardLast4: string }>,
  reason: string,
): Promise<void> {
  console.warn(`[topup] Rolling back ${charged.length} charge(s) for topup ${topupId}: ${reason}`);

  for (const { lineItemId, transferId, cardLast4 } of charged) {
    await plaidCancel(transferId, cardLast4);
    await prisma.topupLineItem.update({
      where: { id: lineItemId },
      data: { status: 'REFUNDED' },
    });
  }

  await prisma.topup.update({ where: { id: topupId }, data: { status: 'ROLLED_BACK' } });
}

function buildRolledBackResult(
  topupId: string,
  amountCents: number,
  lineItems: Array<{ linkedCardId: string; amountCents: number; status: string }>,
  error: string,
): TopupResult {
  return {
    topupId,
    amountCents,
    status: 'ROLLED_BACK',
    lineItems: lineItems.map((li) => ({
      cardId: li.linkedCardId,
      amountCents: li.amountCents,
      status: li.status,
    })),
    error,
  };
}

// ─── History ──────────────────────────────────────────────────────────────────

export async function getTopupHistory(userId: string): Promise<TopupHistoryItem[]> {
  const topups = await prisma.topup.findMany({
    where: { userId },
    select: { id: true, amountCents: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  return topups.map((t) => ({
    topupId: t.id,
    amountCents: t.amountCents,
    status: t.status,
    createdAt: t.createdAt,
  }));
}
