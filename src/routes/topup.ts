import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import * as topupService from '../services/topup.service';

const router = Router();

router.use(requireAuth);

// ─── Schema ───────────────────────────────────────────────────────────────────

const topupSchema = z.object({
  amountCents: z
    .number()
    .int('Amount must be an integer (cents)')
    .min(100, 'Minimum top-up is $1.00 (100 cents)')
    .max(1_000_000_00, 'Maximum top-up is $1,000,000.00'),
});

// ─── POST /topup ──────────────────────────────────────────────────────────────

router.post(
  '/topup',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { amountCents } = topupSchema.parse(req.body);
      const result = await topupService.executeTopup(req.userId, amountCents);

      if (result.status === 'ROLLED_BACK') {
        res.status(422).json(result);
        return;
      }

      res.json(result);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'NO_VIRTUAL_CARD') {
        res.status(422).json({ error: (err as Error).message, code });
        return;
      }
      if (code === 'CARD_NOT_ACTIVE') {
        res.status(422).json({ error: (err as Error).message, code });
        return;
      }
      if (code === 'NO_SPLIT_CONFIG') {
        res.status(422).json({ error: (err as Error).message, code });
        return;
      }
      next(err);
    }
  },
);

// ─── GET /topup/history ───────────────────────────────────────────────────────

router.get(
  '/topup/history',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const history = await topupService.getTopupHistory(req.userId);
      res.json(history);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
