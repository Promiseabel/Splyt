import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as authService from '../services/auth.service';

const router = Router();

// Stricter rate limit for auth endpoints
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later', code: 'RATE_LIMITED' },
});

// ─── Schemas ──────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ─── POST /auth/register ──────────────────────────────────────────────────────

router.post(
  '/register',
  authRateLimit,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = registerSchema.parse(req.body);
      const result = await authService.register(email, password);
      res.status(201).json(result);
    } catch (err) {
      if ((err as { code?: string }).code === 'EMAIL_IN_USE') {
        res.status(409).json({ error: 'Email already registered', code: 'EMAIL_IN_USE' });
        return;
      }
      next(err);
    }
  },
);

// ─── POST /auth/login ─────────────────────────────────────────────────────────

router.post(
  '/login',
  authRateLimit,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const result = await authService.login(email, password);
      res.json(result);
    } catch (err) {
      if ((err as { code?: string }).code === 'INVALID_CREDENTIALS') {
        res.status(401).json({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
        return;
      }
      next(err);
    }
  },
);

// ─── POST /auth/refresh ───────────────────────────────────────────────────────

router.post(
  '/refresh',
  authRateLimit,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = refreshSchema.parse(req.body);
      const result = await authService.refresh(refreshToken);
      res.json(result);
    } catch (err) {
      if ((err as { code?: string }).code === 'INVALID_REFRESH_TOKEN') {
        res
          .status(401)
          .json({ error: 'Invalid or expired refresh token', code: 'INVALID_REFRESH_TOKEN' });
        return;
      }
      next(err);
    }
  },
);

// ─── POST /auth/logout ────────────────────────────────────────────────────────

router.post(
  '/logout',
  authRateLimit,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = refreshSchema.parse(req.body);
      await authService.logout(refreshToken);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

export default router;
