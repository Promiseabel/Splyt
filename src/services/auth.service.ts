import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';

const BCRYPT_ROUNDS = 12;

// ─── Token helpers ────────────────────────────────────────────────────────────

function signAccessToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as string });
}

function signRefreshToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as string,
  });
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function refreshTokenExpiresAt(): Date {
  // Parse e.g. "7d" → 7 days in ms
  const raw = env.JWT_REFRESH_EXPIRES_IN;
  const match = raw.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid JWT_REFRESH_EXPIRES_IN format: ${raw}`);
  const amount = parseInt(match[1], 10);
  const unitMs: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return new Date(Date.now() + amount * unitMs[match[2]]);
}

// ─── Register ─────────────────────────────────────────────────────────────────

export interface RegisterResult {
  userId: string;
  email: string;
}

export async function register(email: string, password: string): Promise<RegisterResult> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw Object.assign(new Error('Email already registered'), { code: 'EMAIL_IN_USE' });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: { email, passwordHash },
    select: { id: true, email: true },
  });

  return { userId: user.id, email: user.email };
}

// ─── Login ────────────────────────────────────────────────────────────────────

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { email } });

  // Constant-time comparison even when user doesn't exist (prevent timing attacks)
  const hash = user?.passwordHash ?? '$2a$12$invalidsaltinvalidsaltinvalidsal';
  const valid = await bcrypt.compare(password, hash);

  if (!user || !valid) {
    throw Object.assign(new Error('Invalid email or password'), { code: 'INVALID_CREDENTIALS' });
  }

  const accessToken = signAccessToken(user.id);
  const refreshToken = signRefreshToken(user.id);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshTokenExpiresAt(),
    },
  });

  return { accessToken, refreshToken };
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

export interface RefreshResult {
  accessToken: string;
}

export async function refresh(token: string): Promise<RefreshResult> {
  let payload: { userId: string };
  try {
    payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as { userId: string };
  } catch {
    throw Object.assign(new Error('Invalid or expired refresh token'), {
      code: 'INVALID_REFRESH_TOKEN',
    });
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (!stored || stored.userId !== payload.userId || stored.expiresAt < new Date()) {
    throw Object.assign(new Error('Invalid or expired refresh token'), {
      code: 'INVALID_REFRESH_TOKEN',
    });
  }

  return { accessToken: signAccessToken(payload.userId) };
}

// ─── Logout (revoke refresh token) ────────────────────────────────────────────

export async function logout(token: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { tokenHash: hashToken(token) } });
}
