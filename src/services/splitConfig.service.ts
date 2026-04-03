import { prisma } from '../lib/prisma';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SplitItem {
  cardId: string;
  percentage: number;
}

export interface SplitConfigResult {
  splitConfigId: string;
  splits: Array<{
    cardId: string;
    last4: string;
    institution: string;
    percentage: number;
  }>;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateSplits(splits: SplitItem[]): void {
  if (splits.length === 0) {
    throw Object.assign(new Error('At least one split is required'), {
      code: 'SPLIT_PERCENTAGE_INVALID',
    });
  }

  for (const s of splits) {
    if (!Number.isInteger(s.percentage) || s.percentage < 1 || s.percentage > 100) {
      throw Object.assign(
        new Error(`Percentage must be an integer between 1 and 100, got ${s.percentage}`),
        { code: 'SPLIT_PERCENTAGE_INVALID' },
      );
    }
  }

  const total = splits.reduce((sum, s) => sum + s.percentage, 0);
  if (total !== 100) {
    throw Object.assign(
      new Error(`Split percentages must sum to exactly 100, got ${total}`),
      { code: 'SPLIT_PERCENTAGE_INVALID' },
    );
  }

  const cardIds = splits.map((s) => s.cardId);
  if (new Set(cardIds).size !== cardIds.length) {
    throw Object.assign(new Error('Duplicate card IDs in split config'), {
      code: 'SPLIT_PERCENTAGE_INVALID',
    });
  }
}

// ─── Set (replace) split config ───────────────────────────────────────────────

export async function setSplitConfig(
  userId: string,
  splits: SplitItem[],
): Promise<SplitConfigResult> {
  // Validate percentages before any DB work
  validateSplits(splits);

  // Verify every card belongs to this user
  const cardIds = splits.map((s) => s.cardId);
  const ownedCards = await prisma.linkedCard.findMany({
    where: { id: { in: cardIds }, userId },
    select: { id: true, last4: true, institutionName: true },
  });

  if (ownedCards.length !== cardIds.length) {
    const foundIds = new Set(ownedCards.map((c) => c.id));
    const missing = cardIds.filter((id) => !foundIds.has(id));
    throw Object.assign(new Error(`Card(s) not found: ${missing.join(', ')}`), {
      code: 'NOT_FOUND',
    });
  }

  // Replace existing config atomically: delete old items + create new config in one transaction
  const cardMap = new Map(ownedCards.map((c) => [c.id, c]));

  const config = await prisma.$transaction(async (tx) => {
    // Delete existing config for user (cascade deletes items)
    await tx.splitConfig.deleteMany({ where: { userId } });

    // Create new config with all items
    return tx.splitConfig.create({
      data: {
        userId,
        items: {
          create: splits.map((s) => ({
            linkedCardId: s.cardId,
            percentage: s.percentage,
          })),
        },
      },
      include: {
        items: {
          include: {
            linkedCard: { select: { id: true, last4: true, institutionName: true } },
          },
        },
      },
    });
  });

  return {
    splitConfigId: config.id,
    splits: config.items.map((item) => ({
      cardId: item.linkedCard.id,
      last4: item.linkedCard.last4,
      institution: item.linkedCard.institutionName,
      percentage: item.percentage,
    })),
  };
}

// ─── Get split config ─────────────────────────────────────────────────────────

export async function getSplitConfig(userId: string): Promise<SplitConfigResult> {
  const config = await prisma.splitConfig.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          linkedCard: { select: { id: true, last4: true, institutionName: true } },
        },
        orderBy: { linkedCard: { createdAt: 'asc' } },
      },
    },
  });

  if (!config) {
    throw Object.assign(new Error('No split config found'), { code: 'NOT_FOUND' });
  }

  return {
    splitConfigId: config.id,
    splits: config.items.map((item) => ({
      cardId: item.linkedCard.id,
      last4: item.linkedCard.last4,
      institution: item.linkedCard.institutionName,
      percentage: item.percentage,
    })),
  };
}

// ─── Internal: fetch raw splits for top-up engine ─────────────────────────────

export async function getSplitsForTopup(
  userId: string,
): Promise<Array<{ cardId: string; plaidAccessTokenEnc: string; percentage: number }>> {
  const config = await prisma.splitConfig.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          linkedCard: { select: { id: true, plaidAccessTokenEnc: true } },
        },
      },
    },
  });

  if (!config || config.items.length === 0) {
    throw Object.assign(new Error('No split config found — set up your split before topping up'), {
      code: 'NO_SPLIT_CONFIG',
    });
  }

  return config.items.map((item) => ({
    cardId: item.linkedCard.id,
    plaidAccessTokenEnc: item.linkedCard.plaidAccessTokenEnc,
    percentage: item.percentage,
  }));
}
