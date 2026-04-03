import request from 'supertest';
import jwt from 'jsonwebtoken';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3000,
    DATABASE_URL: 'postgresql://test',
    JWT_SECRET: 'test-jwt-secret-at-least-32-characters!',
    JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-chars!',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    STRIPE_SECRET_KEY: 'sk_test_fake',
    PLAID_CLIENT_ID: 'fake-client-id',
    PLAID_SECRET: 'fake-plaid-secret',
    PLAID_ENV: 'sandbox',
    PLAID_TOKEN_ENCRYPTION_KEY: 'test-encryption-key-at-least-32chars!!',
  },
}));

// Helpers for building a valid encrypted token in tests
const crypto = require('crypto');
function makeEncToken(plaintext: string): string {
  const key = crypto.createHash('sha256').update('test-encryption-key-at-least-32chars!!').digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

jest.mock('../lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
    virtualCard: { findUnique: jest.fn(), update: jest.fn() },
    splitConfig: { findUnique: jest.fn() },
    linkedCard: { findUnique: jest.fn() },
    topup: { create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    topupLineItem: { update: jest.fn(), findMany: jest.fn() },
  },
}));

jest.mock('../lib/plaid', () => ({
  plaidClient: {
    transferCreate: jest.fn(),
    transferCancel: jest.fn(),
  },
}));

jest.mock('../lib/stripe', () => ({ stripe: {} }));

import app from '../app';
import { prisma } from '../lib/prisma';
import { plaidClient } from '../lib/plaid';

const mockVC = jest.mocked(prisma.virtualCard);
const mockSplitConfig = jest.mocked(prisma.splitConfig);
const mockLinkedCard = jest.mocked(prisma.linkedCard);
const mockTopup = jest.mocked(prisma.topup);
const mockLineItem = jest.mocked(prisma.topupLineItem);
const mockTx = jest.mocked(prisma.$transaction);
const mockPlaid = jest.mocked(plaidClient);

const TEST_USER_ID = 'user-123';
const JWT_SECRET = 'test-jwt-secret-at-least-32-characters!';
const authHeader = () => ({
  Authorization: `Bearer ${jwt.sign({ userId: TEST_USER_ID }, JWT_SECRET, { expiresIn: '15m' })}`,
});

const activeVC = {
  id: 'vc-1', userId: TEST_USER_ID, stripeCardId: 'ic_test', balanceCents: 0,
  status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date(),
};

const splitConfigWithTwoCards = {
  id: 'cfg-1', userId: TEST_USER_ID, createdAt: new Date(), updatedAt: new Date(),
  items: [
    { id: 'item-1', splitConfigId: 'cfg-1', linkedCardId: 'card-1', percentage: 60,
      linkedCard: { id: 'card-1', plaidAccessTokenEnc: makeEncToken('access-token-1') } },
    { id: 'item-2', splitConfigId: 'cfg-1', linkedCardId: 'card-2', percentage: 40,
      linkedCard: { id: 'card-2', plaidAccessTokenEnc: makeEncToken('access-token-2') } },
  ],
};

const pendingTopup = {
  id: 'topup-1', userId: TEST_USER_ID, amountCents: 10000,
  status: 'PENDING', createdAt: new Date(), updatedAt: new Date(),
  lineItems: [
    { id: 'li-1', topupId: 'topup-1', linkedCardId: 'card-1', amountCents: 6000, status: 'PENDING', plaidTransferId: null, createdAt: new Date(), updatedAt: new Date() },
    { id: 'li-2', topupId: 'topup-1', linkedCardId: 'card-2', amountCents: 4000, status: 'PENDING', plaidTransferId: null, createdAt: new Date(), updatedAt: new Date() },
  ],
};

beforeEach(() => jest.clearAllMocks());

// ─── POST /topup — Happy path ─────────────────────────────────────────────────

describe('POST /api/v1/topup — success', () => {
  beforeEach(() => {
    mockVC.findUnique.mockResolvedValue(activeVC);
    mockSplitConfig.findUnique.mockResolvedValue(splitConfigWithTwoCards as never);
    mockTopup.create.mockResolvedValue(pendingTopup as never);

    // card lookups for last4/accountId
    mockLinkedCard.findUnique
      .mockResolvedValueOnce({ id: 'card-1', last4: '1111', plaidAccountId: 'acct-1' } as never)
      .mockResolvedValueOnce({ id: 'card-2', last4: '2222', plaidAccountId: 'acct-2' } as never);

    mockPlaid.transferCreate
      .mockResolvedValueOnce({ data: { transfer: { id: 'tr-1' } } } as never)
      .mockResolvedValueOnce({ data: { transfer: { id: 'tr-2' } } } as never);

    mockLineItem.update.mockResolvedValue({} as never);
    mockTx.mockImplementationOnce(async (fn) =>
      fn({ topup: { update: jest.fn() }, virtualCard: { update: jest.fn() } } as never),
    );

    mockLineItem.findMany.mockResolvedValue([
      { id: 'li-1', topupId: 'topup-1', linkedCardId: 'card-1', amountCents: 6000, status: 'CHARGED', plaidTransferId: 'tr-1', createdAt: new Date(), updatedAt: new Date() },
      { id: 'li-2', topupId: 'topup-1', linkedCardId: 'card-2', amountCents: 4000, status: 'CHARGED', plaidTransferId: 'tr-2', createdAt: new Date(), updatedAt: new Date() },
    ]);
  });

  it('returns 200 with SUCCESS status and correct line items', async () => {
    const res = await request(app)
      .post('/api/v1/topup')
      .set(authHeader())
      .send({ amountCents: 10000 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUCCESS');
    expect(res.body.topupId).toBe('topup-1');
    expect(res.body.amountCents).toBe(10000);
    expect(res.body.lineItems).toHaveLength(2);
  });

  it('charges cards in correct proportional amounts (60/40 split)', async () => {
    await request(app).post('/api/v1/topup').set(authHeader()).send({ amountCents: 10000 });

    expect(mockPlaid.transferCreate).toHaveBeenCalledTimes(2);
    const firstCall = mockPlaid.transferCreate.mock.calls[0][0] as { amount: string };
    const secondCall = mockPlaid.transferCreate.mock.calls[1][0] as { amount: string };
    expect(firstCall.amount).toBe('60.00');   // 6000 cents
    expect(secondCall.amount).toBe('40.00');  // 4000 cents
  });

  it('credits the virtual card balance after all charges succeed (in transaction)', async () => {
    await request(app).post('/api/v1/topup').set(authHeader()).send({ amountCents: 10000 });
    // Transaction must have been called to atomically update topup + balance
    expect(mockTx).toHaveBeenCalledTimes(1);
  });

  it('charges cards sequentially (second charge uses second card token)', async () => {
    await request(app).post('/api/v1/topup').set(authHeader()).send({ amountCents: 10000 });

    const calls = mockPlaid.transferCreate.mock.calls;
    expect(calls[0][0]).toMatchObject({ account_id: 'acct-1' });
    expect(calls[1][0]).toMatchObject({ account_id: 'acct-2' });
  });
});

// ─── POST /topup — Rollback ───────────────────────────────────────────────────

describe('POST /api/v1/topup — rollback on card failure', () => {
  it('cancels first charge and returns 422 when second card fails', async () => {
    mockVC.findUnique.mockResolvedValue(activeVC);
    mockSplitConfig.findUnique.mockResolvedValue(splitConfigWithTwoCards as never);
    mockTopup.create.mockResolvedValue(pendingTopup as never);

    mockLinkedCard.findUnique
      .mockResolvedValueOnce({ id: 'card-1', last4: '1111', plaidAccountId: 'acct-1' } as never)
      .mockResolvedValueOnce({ id: 'card-2', last4: '2222', plaidAccountId: 'acct-2' } as never);

    // First charge succeeds, second fails
    mockPlaid.transferCreate
      .mockResolvedValueOnce({ data: { transfer: { id: 'tr-1' } } } as never)
      .mockRejectedValueOnce(new Error('Insufficient funds'));

    mockLineItem.update.mockResolvedValue({} as never);
    mockPlaid.transferCancel.mockResolvedValue({ data: {} } as never);
    mockTopup.update.mockResolvedValue({} as never);

    const res = await request(app)
      .post('/api/v1/topup')
      .set(authHeader())
      .send({ amountCents: 10000 });

    expect(res.status).toBe(422);
    expect(res.body.status).toBe('ROLLED_BACK');
    expect(res.body.error).toContain('2222'); // mentions the failing card last4
  });

  it('cancels the successful Plaid transfer when rollback occurs', async () => {
    mockVC.findUnique.mockResolvedValue(activeVC);
    mockSplitConfig.findUnique.mockResolvedValue(splitConfigWithTwoCards as never);
    mockTopup.create.mockResolvedValue(pendingTopup as never);

    mockLinkedCard.findUnique
      .mockResolvedValueOnce({ id: 'card-1', last4: '1111', plaidAccountId: 'acct-1' } as never)
      .mockResolvedValueOnce({ id: 'card-2', last4: '2222', plaidAccountId: 'acct-2' } as never);

    mockPlaid.transferCreate
      .mockResolvedValueOnce({ data: { transfer: { id: 'tr-1' } } } as never)
      .mockRejectedValueOnce(new Error('Card declined'));

    mockLineItem.update.mockResolvedValue({} as never);
    mockPlaid.transferCancel.mockResolvedValue({ data: {} } as never);
    mockTopup.update.mockResolvedValue({} as never);

    await request(app).post('/api/v1/topup').set(authHeader()).send({ amountCents: 10000 });

    // The first successful transfer (tr-1) must be cancelled
    expect(mockPlaid.transferCancel).toHaveBeenCalledWith({ transfer_id: 'tr-1' });
  });

  it('does NOT credit virtual card balance when rollback occurs', async () => {
    mockVC.findUnique.mockResolvedValue(activeVC);
    mockSplitConfig.findUnique.mockResolvedValue(splitConfigWithTwoCards as never);
    mockTopup.create.mockResolvedValue(pendingTopup as never);

    mockLinkedCard.findUnique
      .mockResolvedValueOnce({ id: 'card-1', last4: '1111', plaidAccountId: 'acct-1' } as never)
      .mockResolvedValueOnce({ id: 'card-2', last4: '2222', plaidAccountId: 'acct-2' } as never);

    mockPlaid.transferCreate
      .mockResolvedValueOnce({ data: { transfer: { id: 'tr-1' } } } as never)
      .mockRejectedValueOnce(new Error('Card declined'));

    mockLineItem.update.mockResolvedValue({} as never);
    mockPlaid.transferCancel.mockResolvedValue({ data: {} } as never);
    mockTopup.update.mockResolvedValue({} as never);

    await request(app).post('/api/v1/topup').set(authHeader()).send({ amountCents: 10000 });

    // $transaction (which credits balance) must NOT be called
    expect(mockTx).not.toHaveBeenCalled();
  });
});

// ─── POST /topup — Guards ─────────────────────────────────────────────────────

describe('POST /api/v1/topup — pre-condition guards', () => {
  it('returns 422 when no virtual card exists', async () => {
    mockVC.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/topup')
      .set(authHeader())
      .send({ amountCents: 10000 });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('NO_VIRTUAL_CARD');
    expect(mockPlaid.transferCreate).not.toHaveBeenCalled();
  });

  it('returns 422 when virtual card is not active', async () => {
    mockVC.findUnique.mockResolvedValue({ ...activeVC, status: 'FROZEN' });

    const res = await request(app)
      .post('/api/v1/topup')
      .set(authHeader())
      .send({ amountCents: 10000 });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('CARD_NOT_ACTIVE');
  });

  it('returns 422 when no split config is set', async () => {
    mockVC.findUnique.mockResolvedValue(activeVC);
    mockSplitConfig.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/topup')
      .set(authHeader())
      .send({ amountCents: 10000 });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('NO_SPLIT_CONFIG');
  });

  it('returns 400 when amountCents is below minimum (100)', async () => {
    const res = await request(app)
      .post('/api/v1/topup')
      .set(authHeader())
      .send({ amountCents: 99 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for a float amount', async () => {
    const res = await request(app)
      .post('/api/v1/topup')
      .set(authHeader())
      .send({ amountCents: 100.5 });

    expect(res.status).toBe(400);
  });

  it('returns 400 when amountCents is missing', async () => {
    const res = await request(app).post('/api/v1/topup').set(authHeader()).send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/v1/topup').send({ amountCents: 10000 });
    expect(res.status).toBe(401);
  });
});

// ─── GET /topup/history ───────────────────────────────────────────────────────

describe('GET /api/v1/topup/history', () => {
  it('returns top-up history in descending order', async () => {
    mockTopup.findMany.mockResolvedValue([
      { id: 'topup-2', amountCents: 5000, status: 'SUCCESS', createdAt: new Date('2026-02-01') },
      { id: 'topup-1', amountCents: 10000, status: 'SUCCESS', createdAt: new Date('2026-01-01') },
    ] as never);

    const res = await request(app).get('/api/v1/topup/history').set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].topupId).toBe('topup-2'); // most recent first
  });

  it('returns empty array when no top-ups exist', async () => {
    mockTopup.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/topup/history').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/topup/history');
    expect(res.status).toBe(401);
  });
});
