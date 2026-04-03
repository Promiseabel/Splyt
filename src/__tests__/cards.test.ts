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
    linkedCard: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('../lib/plaid', () => ({
  plaidClient: {
    linkTokenCreate: jest.fn(),
    itemPublicTokenExchange: jest.fn(),
    authGet: jest.fn(),
    itemRemove: jest.fn(),
  },
}));

jest.mock('../lib/stripe', () => ({ stripe: {} }));

import app from '../app';
import { prisma } from '../lib/prisma';
import { plaidClient } from '../lib/plaid';

const mockCard = jest.mocked(prisma.linkedCard);
const mockPlaid = jest.mocked(plaidClient);

// Helper: create a valid access token for user-123
const TEST_USER_ID = 'user-123';
const JWT_SECRET = 'test-jwt-secret-at-least-32-characters!';
const authHeader = () => ({
  Authorization: `Bearer ${jwt.sign({ userId: TEST_USER_ID }, JWT_SECRET, { expiresIn: '15m' })}`,
});

beforeEach(() => jest.clearAllMocks());

// ─── GET /plaid/link-token ────────────────────────────────────────────────────

describe('GET /api/v1/plaid/link-token', () => {
  it('returns a link token for authenticated user', async () => {
    mockPlaid.linkTokenCreate.mockResolvedValueOnce({
      data: { link_token: 'link-sandbox-abc123', request_id: 'req-1', expiration: '' },
    } as never);

    const res = await request(app).get('/api/v1/plaid/link-token').set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.linkToken).toBe('link-sandbox-abc123');
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/plaid/link-token');
    expect(res.status).toBe(401);
  });
});

// ─── POST /plaid/exchange-token ───────────────────────────────────────────────

describe('POST /api/v1/plaid/exchange-token', () => {
  it('exchanges token and stores encrypted card', async () => {
    mockPlaid.itemPublicTokenExchange.mockResolvedValueOnce({
      data: { access_token: 'access-sandbox-token', item_id: 'item-1', request_id: 'req-2' },
    } as never);

    mockPlaid.authGet.mockResolvedValueOnce({
      data: {
        accounts: [{ account_id: 'acct-abc', mask: '4242', name: 'Checking' }],
        item: { institution_id: 'ins_chase', item_id: 'item-1' },
        numbers: { ach: [], eft: [], international: [], bacs: [] },
        request_id: 'req-3',
      },
    } as never);

    mockCard.findUnique.mockResolvedValueOnce(null); // no duplicate

    mockCard.create.mockResolvedValueOnce({
      id: 'card-xyz',
      last4: '4242',
      institutionName: 'ins_chase',
      userId: TEST_USER_ID,
      plaidAccessTokenEnc: 'encrypted',
      plaidAccountId: 'acct-abc',
      createdAt: new Date(),
    });

    const res = await request(app)
      .post('/api/v1/plaid/exchange-token')
      .set(authHeader())
      .send({ publicToken: 'public-sandbox-token', accountId: 'acct-abc' });

    expect(res.status).toBe(201);
    expect(res.body.cardId).toBe('card-xyz');
    expect(res.body.last4).toBe('4242');
    // Verify the raw access token was never put in the response
    expect(JSON.stringify(res.body)).not.toContain('access-sandbox-token');
  });

  it('returns 409 when card is already linked', async () => {
    mockPlaid.itemPublicTokenExchange.mockResolvedValueOnce({
      data: { access_token: 'access-sandbox-token', item_id: 'item-1', request_id: 'req-2' },
    } as never);

    mockPlaid.authGet.mockResolvedValueOnce({
      data: {
        accounts: [{ account_id: 'acct-abc', mask: '4242', name: 'Checking' }],
        item: { institution_id: 'ins_chase', item_id: 'item-1' },
        numbers: { ach: [], eft: [], international: [], bacs: [] },
        request_id: 'req-3',
      },
    } as never);

    mockCard.findUnique.mockResolvedValueOnce({
      id: 'existing-card',
      userId: TEST_USER_ID,
      plaidAccessTokenEnc: 'enc',
      plaidAccountId: 'acct-abc',
      institutionName: 'Chase',
      last4: '4242',
      createdAt: new Date(),
    });

    const res = await request(app)
      .post('/api/v1/plaid/exchange-token')
      .set(authHeader())
      .send({ publicToken: 'public-sandbox-token', accountId: 'acct-abc' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CARD_ALREADY_LINKED');
  });

  it('returns 400 when publicToken is missing', async () => {
    const res = await request(app)
      .post('/api/v1/plaid/exchange-token')
      .set(authHeader())
      .send({ accountId: 'acct-abc' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/v1/plaid/exchange-token')
      .send({ publicToken: 'tok', accountId: 'acct-abc' });
    expect(res.status).toBe(401);
  });
});

// ─── GET /cards ───────────────────────────────────────────────────────────────

describe('GET /api/v1/cards', () => {
  it('returns list of linked cards (no sensitive data)', async () => {
    mockCard.findMany.mockResolvedValueOnce([
      {
        id: 'card-1',
        last4: '1234',
        institutionName: 'Chase',
        createdAt: new Date('2026-01-01'),
        userId: TEST_USER_ID,
        plaidAccessTokenEnc: 'SHOULD_NOT_APPEAR',
        plaidAccountId: 'acct-1',
      },
    ]);

    const res = await request(app).get('/api/v1/cards').set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].last4).toBe('1234');
    expect(res.body[0].institution).toBe('Chase');
    // Encrypted token must never be in the response
    expect(JSON.stringify(res.body)).not.toContain('SHOULD_NOT_APPEAR');
    expect(JSON.stringify(res.body)).not.toContain('plaidAccessTokenEnc');
  });

  it('returns empty array when no cards linked', async () => {
    mockCard.findMany.mockResolvedValueOnce([]);
    const res = await request(app).get('/api/v1/cards').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/cards');
    expect(res.status).toBe(401);
  });
});

// ─── DELETE /cards/:id ────────────────────────────────────────────────────────

describe('DELETE /api/v1/cards/:id', () => {
  it('unlinks card and revokes Plaid access token', async () => {
    mockCard.findUnique.mockResolvedValueOnce({
      id: 'card-1',
      userId: TEST_USER_ID,
      plaidAccountId: 'acct-1',
      institutionName: 'Chase',
      last4: '1234',
      createdAt: new Date(),
      // Provide a real encrypted value so decrypt works in test
      plaidAccessTokenEnc: (() => {
        // We need to generate a real encrypted token for this test
        // Use the encrypt function directly
        const crypto = require('crypto');
        const key = crypto.createHash('sha256').update('test-encryption-key-at-least-32chars!!').digest();
        const iv = Buffer.alloc(12, 0); // fixed IV for test predictability
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
        const encrypted = Buffer.concat([cipher.update('access-token', 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
      })(),
    });

    mockPlaid.itemRemove.mockResolvedValueOnce({ data: { request_id: 'req-rm' } } as never);
    mockCard.delete.mockResolvedValueOnce({} as never);

    const res = await request(app).delete('/api/v1/cards/card-1').set(authHeader());

    expect(res.status).toBe(204);
    expect(mockPlaid.itemRemove).toHaveBeenCalledTimes(1);
    expect(mockCard.delete).toHaveBeenCalledWith({ where: { id: 'card-1' } });
  });

  it('returns 404 for a card that does not belong to user', async () => {
    mockCard.findUnique.mockResolvedValueOnce({
      id: 'card-other',
      userId: 'different-user',
      plaidAccountId: 'acct-x',
      institutionName: 'BoA',
      last4: '9999',
      createdAt: new Date(),
      plaidAccessTokenEnc: 'enc',
    });

    const res = await request(app).delete('/api/v1/cards/card-other').set(authHeader());
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('returns 404 for a non-existent card', async () => {
    mockCard.findUnique.mockResolvedValueOnce(null);
    const res = await request(app).delete('/api/v1/cards/nonexistent').set(authHeader());
    expect(res.status).toBe(404);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).delete('/api/v1/cards/card-1');
    expect(res.status).toBe(401);
  });
});

// ─── Encryption utility ───────────────────────────────────────────────────────

describe('encrypt/decrypt round-trip', () => {
  it('encrypts and decrypts a Plaid access token correctly', () => {
    const { encrypt, decrypt } = require('../lib/encrypt');
    const original = 'access-sandbox-abc123xyz';
    const encrypted = encrypt(original);
    expect(encrypted).not.toContain(original);
    expect(decrypt(encrypted)).toBe(original);
  });

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const { encrypt } = require('../lib/encrypt');
    const a = encrypt('same-token');
    const b = encrypt('same-token');
    expect(a).not.toBe(b);
  });

  it('throws when ciphertext is tampered', () => {
    const { encrypt, decrypt } = require('../lib/encrypt');
    const encrypted = encrypt('some-token');
    const tampered = encrypted.slice(0, -4) + 'beef';
    expect(() => decrypt(tampered)).toThrow();
  });
});
