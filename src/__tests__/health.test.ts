import request from 'supertest';

// Mock prisma before importing app
jest.mock('../lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}));

// Mock env config
jest.mock('../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3000,
    DATABASE_URL: 'postgresql://test',
    JWT_SECRET: 'test-secret-at-least-32-characters-long',
    JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-chars',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    STRIPE_SECRET_KEY: 'sk_test_fake',
    PLAID_CLIENT_ID: 'fake-client-id',
    PLAID_SECRET: 'fake-plaid-secret',
    PLAID_ENV: 'sandbox',
    PLAID_TOKEN_ENCRYPTION_KEY: 'test-encryption-key-at-least-32chars',
  },
}));

import app from '../app';

describe('GET /api/v1/health', () => {
  it('returns 200 with ok status when DB is connected', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
  });

  it('returns 503 when DB is disconnected', async () => {
    const { prisma } = await import('../lib/prisma');
    (prisma.$queryRaw as jest.Mock).mockRejectedValueOnce(new Error('Connection refused'));

    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('error');
  });
});
