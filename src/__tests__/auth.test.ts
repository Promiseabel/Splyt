import request from 'supertest';

// ─── Mocks (must come before app import) ──────────────────────────────────────

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
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('../lib/stripe', () => ({ stripe: {} }));
jest.mock('../lib/plaid', () => ({ plaidClient: {} }));

import app from '../app';
import { prisma } from '../lib/prisma';

const mockUser = jest.mocked(prisma.user);
const mockRefreshToken = jest.mocked(prisma.refreshToken);

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── POST /auth/register ──────────────────────────────────────────────────────

describe('POST /api/v1/auth/register', () => {
  it('creates a new user and returns 201', async () => {
    mockUser.findUnique.mockResolvedValueOnce(null);
    mockUser.create.mockResolvedValueOnce({
      id: 'user-123',
      email: 'test@example.com',
      passwordHash: 'hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'test@example.com',
      password: 'SecurePass123',
    });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe('user-123');
    expect(res.body.email).toBe('test@example.com');
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('returns 409 when email already exists', async () => {
    mockUser.findUnique.mockResolvedValueOnce({
      id: 'existing',
      email: 'test@example.com',
      passwordHash: 'hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'test@example.com',
      password: 'SecurePass123',
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_IN_USE');
  });

  it('returns 400 for invalid email', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'not-an-email',
      password: 'SecurePass123',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'test@example.com',
      password: 'short',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when body is missing', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({});
    expect(res.status).toBe(400);
  });
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  it('returns tokens on valid credentials', async () => {
    // bcrypt hash of 'SecurePass123' — pre-computed to avoid slow hash in tests
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('SecurePass123', 1); // low rounds for speed in tests

    mockUser.findUnique.mockResolvedValueOnce({
      id: 'user-123',
      email: 'test@example.com',
      passwordHash: hash,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockRefreshToken.create.mockResolvedValueOnce({
      id: 'rt-1',
      userId: 'user-123',
      tokenHash: 'hash',
      expiresAt: new Date(),
      createdAt: new Date(),
    });

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'test@example.com',
      password: 'SecurePass123',
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  it('returns 401 for wrong password', async () => {
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('CorrectPassword', 1);

    mockUser.findUnique.mockResolvedValueOnce({
      id: 'user-123',
      email: 'test@example.com',
      passwordHash: hash,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'test@example.com',
      password: 'WrongPassword',
    });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 for non-existent user', async () => {
    mockUser.findUnique.mockResolvedValueOnce(null);

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'nobody@example.com',
      password: 'AnyPassword123',
    });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });
});

// ─── POST /auth/refresh ───────────────────────────────────────────────────────

describe('POST /api/v1/auth/refresh', () => {
  it('returns new access token for valid refresh token', async () => {
    const jwt = await import('jsonwebtoken');
    const validToken = jwt.sign(
      { userId: 'user-123' },
      'test-refresh-secret-at-least-32-chars!',
      { expiresIn: '7d' },
    );

    mockRefreshToken.findUnique.mockResolvedValueOnce({
      id: 'rt-1',
      userId: 'user-123',
      tokenHash: 'any',
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt: new Date(),
    });

    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: validToken });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });

  it('returns 401 for an expired/invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'totally.invalid.token' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('returns 400 when refreshToken is missing', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({});
    expect(res.status).toBe(400);
  });
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────

describe('POST /api/v1/auth/logout', () => {
  it('returns 204 and revokes the refresh token', async () => {
    mockRefreshToken.deleteMany.mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'some-token' });

    expect(res.status).toBe(204);
    expect(mockRefreshToken.deleteMany).toHaveBeenCalledTimes(1);
  });
});
