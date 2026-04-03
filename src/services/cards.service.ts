import { CountryCode, Products } from 'plaid';
import { plaidClient } from '../lib/plaid';
import { prisma } from '../lib/prisma';
import { encrypt, decrypt } from '../lib/encrypt';

// ─── Link Token ───────────────────────────────────────────────────────────────

export interface LinkTokenResult {
  linkToken: string;
}

export async function createLinkToken(userId: string): Promise<LinkTokenResult> {
  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: 'Splyt',
    products: [Products.Auth],
    country_codes: [CountryCode.Us],
    language: 'en',
  });

  return { linkToken: response.data.link_token };
}

// ─── Exchange Token ───────────────────────────────────────────────────────────

export interface ExchangeTokenResult {
  cardId: string;
  last4: string;
  institution: string;
}

export async function exchangeToken(
  userId: string,
  publicToken: string,
  accountId: string,
): Promise<ExchangeTokenResult> {
  // Exchange public token for access token — never log the access token
  const exchangeResponse = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
  const accessToken = exchangeResponse.data.access_token;

  // Fetch account details for display metadata (last4, institution)
  const authResponse = await plaidClient.authGet({ access_token: accessToken });

  const account = authResponse.data.accounts.find((a) => a.account_id === accountId);
  if (!account) {
    throw Object.assign(new Error('Account not found in Plaid response'), {
      code: 'ACCOUNT_NOT_FOUND',
    });
  }

  const institution = authResponse.data.item.institution_id ?? 'Unknown Institution';
  const last4 = account.mask ?? '****';

  // Check for duplicate (same user + same Plaid account)
  const existing = await prisma.linkedCard.findUnique({
    where: { userId_plaidAccountId: { userId, plaidAccountId: accountId } },
  });
  if (existing) {
    throw Object.assign(new Error('This card is already linked'), { code: 'CARD_ALREADY_LINKED' });
  }

  // Encrypt access token before storing — raw token never written to DB
  const plaidAccessTokenEnc = encrypt(accessToken);

  const card = await prisma.linkedCard.create({
    data: {
      userId,
      plaidAccessTokenEnc,
      plaidAccountId: accountId,
      institutionName: institution,
      last4,
    },
    select: { id: true, last4: true, institutionName: true },
  });

  return { cardId: card.id, last4: card.last4, institution: card.institutionName };
}

// ─── List Cards ───────────────────────────────────────────────────────────────

export interface LinkedCardSummary {
  id: string;
  last4: string;
  institution: string;
  createdAt: Date;
}

export async function listCards(userId: string): Promise<LinkedCardSummary[]> {
  const cards = await prisma.linkedCard.findMany({
    where: { userId },
    select: { id: true, last4: true, institutionName: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  return cards.map((c) => ({
    id: c.id,
    last4: c.last4,
    institution: c.institutionName,
    createdAt: c.createdAt,
  }));
}

// ─── Delete Card ──────────────────────────────────────────────────────────────

export async function deleteCard(userId: string, cardId: string): Promise<void> {
  const card = await prisma.linkedCard.findUnique({ where: { id: cardId } });

  if (!card || card.userId !== userId) {
    throw Object.assign(new Error('Card not found'), { code: 'NOT_FOUND' });
  }

  // Revoke Plaid access token before removing from DB
  try {
    const accessToken = decrypt(card.plaidAccessTokenEnc);
    await plaidClient.itemRemove({ access_token: accessToken });
  } catch {
    // Log the failure but proceed with DB deletion — Plaid revocation is best-effort
    console.warn(`[cards] Plaid itemRemove failed for card ****${card.last4} — continuing with DB deletion`);
  }

  await prisma.linkedCard.delete({ where: { id: cardId } });
}

// ─── Internal: get decrypted access token (used by top-up service) ────────────

export async function getAccessToken(userId: string, cardId: string): Promise<string> {
  const card = await prisma.linkedCard.findUnique({ where: { id: cardId } });
  if (!card || card.userId !== userId) {
    throw Object.assign(new Error('Card not found'), { code: 'NOT_FOUND' });
  }
  return decrypt(card.plaidAccessTokenEnc);
}
