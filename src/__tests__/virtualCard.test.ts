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
    user: { findUnique: jest.fn() },
    virtualCard: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../lib/stripe', () => ({
  stripe: {
    issuing: {
      cardholders: { create: jest.fn() },
      cards: { create: jest.fn(), retrieve: jest.fn() },
    },
  },
}));

jest.mock('../lib/plaid', () => ({ plaidClient: {} }));

import app from '../app';
import { prisma } from '../lib/prisma';
import { stripe } from '../lib/stripe';

const mockUser = jest.mocked(prisma.user);
const mockVC = jest.mocked(prisma.virtualCard);
const mockStripeCardholders = jest.mocked(stripe.issuing.cardholders);
const mockStripeCards = jest.mocked(stripe.issuing.cards);

const TEST_USER_ID = 'user-123';
const JWT_SECRET = 'test-jwt-secret-at-least-32-characters!';
const authHeader = () => ({
  Authorization: `Bearer ${jwt.sign({ userId: TEST_USER_ID }, JWT_SECRET, { expiresIn: '15m' })}`,
});

// Reusable Stripe mock responses
const fakeCardholder = { id: 'ich_test_123' };
const fakeStripeCard = {
  id: 'ic_test_abc',
  last4: '8765',
  exp_month: 12,
  exp_year: 2027,
  status: 'active',
  cardholder: { id: 'ich_test_123' },
};

beforeEach(() => jest.clearAllMocks());

// ─── POST /virtual-card ───────────────────────────────────────────────────────

describe('POST /api/v1/virtual-card', () => {
  it('creates cardholder + virtual card and returns 201', async () => {
    mockUser.findUnique.mockResolvedValueOnce({
      id: TEST_USER_ID,
      email: 'user@example.com',
      passwordHash: 'h',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockVC.findUnique.mockResolvedValueOnce(null); // no existing card
    mockStripeCardholders.create.mockResolvedValueOnce(fakeCardholder as never);
    mockStripeCards.create.mockResolvedValueOnce(fakeStripeCard as never);
    mockVC.create.mockResolvedValueOnce({
      id: 'vc-local-1',
      userId: TEST_USER_ID,
      stripeCardId: 'ic_test_abc',
      balanceCents: 0,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app).post('/api/v1/virtual-card').set(authHeader());

    expect(res.status).toBe(201);
    expect(res.body.cardId).toBe('vc-local-1');
    expect(res.body.stripeCardId).toBe('ic_test_abc');
    expect(res.body.last4).toBe('8765');
    expect(res.body.balanceCents).toBe(0);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.expMonth).toBe(12);
    expect(res.body.expYear).toBe(2027);
  });

  it('creates Stripe cardholder before the card', async () => {
    mockUser.findUnique.mockResolvedValueOnce({
      id: TEST_USER_ID,
      email: 'user@example.com',
      passwordHash: 'h',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockVC.findUnique.mockResolvedValueOnce(null);
    mockStripeCardholders.create.mockResolvedValueOnce(fakeCardholder as never);
    mockStripeCards.create.mockResolvedValueOnce(fakeStripeCard as never);
    mockVC.create.mockResolvedValueOnce({
      id: 'vc-local-1',
      userId: TEST_USER_ID,
      stripeCardId: 'ic_test_abc',
      balanceCents: 0,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await request(app).post('/api/v1/virtual-card').set(authHeader());

    expect(mockStripeCardholders.create).toHaveBeenCalledTimes(1);
    expect(mockStripeCards.create).toHaveBeenCalledWith(
      expect.objectContaining({ cardholder: 'ich_test_123', type: 'virtual' }),
    );
  });

  it('returns 409 when user already has a virtual card', async () => {
    mockUser.findUnique.mockResolvedValueOnce({
      id: TEST_USER_ID,
      email: 'user@example.com',
      passwordHash: 'h',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockVC.findUnique.mockResolvedValueOnce({
      id: 'existing-vc',
      userId: TEST_USER_ID,
      stripeCardId: 'ic_existing',
      balanceCents: 5000,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app).post('/api/v1/virtual-card').set(authHeader());

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CARD_ALREADY_EXISTS');
    expect(mockStripeCardholders.create).not.toHaveBeenCalled();
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/v1/virtual-card');
    expect(res.status).toBe(401);
  });
});

// ─── GET /virtual-card ────────────────────────────────────────────────────────

describe('GET /api/v1/virtual-card', () => {
  it('returns virtual card details with live Stripe metadata', async () => {
    mockVC.findUnique.mockResolvedValueOnce({
      id: 'vc-local-1',
      userId: TEST_USER_ID,
      stripeCardId: 'ic_test_abc',
      balanceCents: 12500,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockStripeCards.retrieve.mockResolvedValueOnce(fakeStripeCard as never);

    const res = await request(app).get('/api/v1/virtual-card').set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.cardId).toBe('vc-local-1');
    expect(res.body.last4).toBe('8765');
    expect(res.body.balanceCents).toBe(12500);
    expect(res.body.expMonth).toBe(12);
    expect(res.body.expYear).toBe(2027);
  });

  it('fetches balance from our DB not Stripe (Stripe has no balance concept for issued cards)', async () => {
    mockVC.findUnique.mockResolvedValueOnce({
      id: 'vc-local-1',
      userId: TEST_USER_ID,
      stripeCardId: 'ic_test_abc',
      balanceCents: 99900,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockStripeCards.retrieve.mockResolvedValueOnce(fakeStripeCard as never);

    const res = await request(app).get('/api/v1/virtual-card').set(authHeader());

    expect(res.body.balanceCents).toBe(99900);
  });

  it('returns 404 when no virtual card exists', async () => {
    mockVC.findUnique.mockResolvedValueOnce(null);

    const res = await request(app).get('/api/v1/virtual-card').set(authHeader());

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/virtual-card');
    expect(res.status).toBe(401);
  });
});
