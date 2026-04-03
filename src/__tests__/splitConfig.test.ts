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

jest.mock('../lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
    linkedCard: { findMany: jest.fn() },
    splitConfig: {
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('../lib/stripe', () => ({ stripe: {} }));
jest.mock('../lib/plaid', () => ({ plaidClient: {} }));

import app from '../app';
import { prisma } from '../lib/prisma';

const mockLinkedCard = jest.mocked(prisma.linkedCard);
const mockSplitConfig = jest.mocked(prisma.splitConfig);
const mockTx = jest.mocked(prisma.$transaction);

const TEST_USER_ID = 'user-123';
const JWT_SECRET = 'test-jwt-secret-at-least-32-characters!';
const authHeader = () => ({
  Authorization: `Bearer ${jwt.sign({ userId: TEST_USER_ID }, JWT_SECRET, { expiresIn: '15m' })}`,
});

// Reusable fixtures
const card1 = { id: 'card-1', last4: '1111', institutionName: 'Chase', userId: TEST_USER_ID, plaidAccessTokenEnc: 'enc1', plaidAccountId: 'acct-1', createdAt: new Date() };
const card2 = { id: 'card-2', last4: '2222', institutionName: 'BoA', userId: TEST_USER_ID, plaidAccessTokenEnc: 'enc2', plaidAccountId: 'acct-2', createdAt: new Date() };

const configResult = {
  id: 'cfg-1',
  userId: TEST_USER_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
  items: [
    { id: 'item-1', splitConfigId: 'cfg-1', linkedCardId: 'card-1', percentage: 60, linkedCard: { id: 'card-1', last4: '1111', institutionName: 'Chase' } },
    { id: 'item-2', splitConfigId: 'cfg-1', linkedCardId: 'card-2', percentage: 40, linkedCard: { id: 'card-2', last4: '2222', institutionName: 'BoA' } },
  ],
};

beforeEach(() => jest.clearAllMocks());

// ─── POST /split-config ───────────────────────────────────────────────────────

describe('POST /api/v1/split-config', () => {
  it('sets a valid 60/40 split and returns config', async () => {
    mockLinkedCard.findMany.mockResolvedValueOnce([card1, card2]);
    mockTx.mockImplementationOnce(async (fn) => fn({
      splitConfig: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue(configResult) },
    } as never));

    const res = await request(app)
      .post('/api/v1/split-config')
      .set(authHeader())
      .send({ splits: [{ cardId: 'card-1', percentage: 60 }, { cardId: 'card-2', percentage: 40 }] });

    expect(res.status).toBe(200);
    expect(res.body.splitConfigId).toBe('cfg-1');
    expect(res.body.splits).toHaveLength(2);
    expect(res.body.splits[0].percentage).toBe(60);
    expect(res.body.splits[1].percentage).toBe(40);
  });

  it('replaces an existing split config (delete + create in transaction)', async () => {
    mockLinkedCard.findMany.mockResolvedValueOnce([card1, card2]);
    const mockDelete = jest.fn();
    const mockCreate = jest.fn().mockResolvedValue(configResult);
    mockTx.mockImplementationOnce(async (fn) => fn({
      splitConfig: { deleteMany: mockDelete, create: mockCreate },
    } as never));

    await request(app)
      .post('/api/v1/split-config')
      .set(authHeader())
      .send({ splits: [{ cardId: 'card-1', percentage: 60 }, { cardId: 'card-2', percentage: 40 }] });

    expect(mockDelete).toHaveBeenCalledWith({ where: { userId: TEST_USER_ID } });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('returns 422 when percentages do not sum to 100', async () => {
    const res = await request(app)
      .post('/api/v1/split-config')
      .set(authHeader())
      .send({ splits: [{ cardId: 'card-1', percentage: 60 }, { cardId: 'card-2', percentage: 30 }] });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('SPLIT_PERCENTAGE_INVALID');
    expect(mockLinkedCard.findMany).not.toHaveBeenCalled();
  });

  it('returns 422 for a single card at 99% (not 100)', async () => {
    const res = await request(app)
      .post('/api/v1/split-config')
      .set(authHeader())
      .send({ splits: [{ cardId: 'card-1', percentage: 99 }] });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('SPLIT_PERCENTAGE_INVALID');
  });

  it('accepts a single card at 100%', async () => {
    mockLinkedCard.findMany.mockResolvedValueOnce([card1]);
    const singleItemConfig = {
      ...configResult,
      items: [{ ...configResult.items[0], percentage: 100 }],
    };
    mockTx.mockImplementationOnce(async (fn) => fn({
      splitConfig: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue(singleItemConfig) },
    } as never));

    const res = await request(app)
      .post('/api/v1/split-config')
      .set(authHeader())
      .send({ splits: [{ cardId: 'card-1', percentage: 100 }] });

    expect(res.status).toBe(200);
  });

  it('returns 422 for duplicate card IDs in request', async () => {
    const res = await request(app)
      .post('/api/v1/split-config')
      .set(authHeader())
      .send({ splits: [{ cardId: 'card-1', percentage: 50 }, { cardId: 'card-1', percentage: 50 }] });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('SPLIT_PERCENTAGE_INVALID');
  });

  it('returns 422 for float percentages', async () => {
    const res = await request(app)
      .post('/api/v1/split-config')
      .set(authHeader())
      .send({ splits: [{ cardId: 'card-1', percentage: 33.3 }, { cardId: 'card-2', percentage: 66.7 }] });

    expect(res.status).toBe(422);
  });

  it('returns 404 when a card does not belong to user', async () => {
    // Only returns card-1, not card-2 — simulating card-2 not owned by user
    mockLinkedCard.findMany.mockResolvedValueOnce([card1]);

    const res = await request(app)
      .post('/api/v1/split-config')
      .set(authHeader())
      .send({ splits: [{ cardId: 'card-1', percentage: 60 }, { cardId: 'card-2', percentage: 40 }] });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(mockTx).not.toHaveBeenCalled();
  });

  it('returns 400 when splits array is missing', async () => {
    const res = await request(app)
      .post('/api/v1/split-config')
      .set(authHeader())
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for an empty splits array', async () => {
    const res = await request(app)
      .post('/api/v1/split-config')
      .set(authHeader())
      .send({ splits: [] });

    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/v1/split-config').send({ splits: [] });
    expect(res.status).toBe(401);
  });
});

// ─── GET /split-config ────────────────────────────────────────────────────────

describe('GET /api/v1/split-config', () => {
  it('returns the current split config', async () => {
    mockSplitConfig.findUnique.mockResolvedValueOnce(configResult as never);

    const res = await request(app).get('/api/v1/split-config').set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.splitConfigId).toBe('cfg-1');
    expect(res.body.splits).toHaveLength(2);
    expect(res.body.splits[0]).toMatchObject({ cardId: 'card-1', last4: '1111', institution: 'Chase', percentage: 60 });
    expect(res.body.splits[1]).toMatchObject({ cardId: 'card-2', last4: '2222', institution: 'BoA', percentage: 40 });
  });

  it('does not expose plaidAccessTokenEnc in response', async () => {
    mockSplitConfig.findUnique.mockResolvedValueOnce(configResult as never);

    const res = await request(app).get('/api/v1/split-config').set(authHeader());

    expect(JSON.stringify(res.body)).not.toContain('plaidAccessTokenEnc');
    expect(JSON.stringify(res.body)).not.toContain('enc');
  });

  it('returns 404 when no split config exists', async () => {
    mockSplitConfig.findUnique.mockResolvedValueOnce(null);

    const res = await request(app).get('/api/v1/split-config').set(authHeader());

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/split-config');
    expect(res.status).toBe(401);
  });
});
