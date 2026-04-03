import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import * as splitConfigService from '../services/splitConfig.service';

const router = Router();

router.use(requireAuth);

// ─── Schema ───────────────────────────────────────────────────────────────────

const setSplitConfigSchema = z.object({
  splits: z
    .array(
      z.object({
        cardId: z.string().min(1, 'cardId is required'),
        percentage: z
          .number()
          .int('Percentage must be an integer')
          .min(1, 'Percentage must be at least 1')
          .max(100, 'Percentage cannot exceed 100'),
      }),
    )
    .min(1, 'At least one split entry is required'),
});

// ─── POST /split-config ───────────────────────────────────────────────────────

router.post(
  '/split-config',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { splits } = setSplitConfigSchema.parse(req.body);
      const result = await splitConfigService.setSplitConfig(req.userId, splits);
      res.json(result);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'SPLIT_PERCENTAGE_INVALID') {
        res.status(422).json({ error: (err as Error).message, code });
        return;
      }
      if (code === 'NOT_FOUND') {
        res.status(404).json({ error: (err as Error).message, code });
        return;
      }
      next(err);
    }
  },
);

// ─── GET /split-config ────────────────────────────────────────────────────────

router.get(
  '/split-config',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await splitConfigService.getSplitConfig(req.userId);
      res.json(result);
    } catch (err) {
      if ((err as { code?: string }).code === 'NOT_FOUND') {
        res.status(404).json({ error: 'No split config found', code: 'NOT_FOUND' });
        return;
      }
      next(err);
    }
  },
);

export default router;
