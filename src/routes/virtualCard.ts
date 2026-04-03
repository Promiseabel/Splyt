import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import * as virtualCardService from '../services/virtualCard.service';

const router = Router();

router.use(requireAuth);

// ─── POST /virtual-card ───────────────────────────────────────────────────────

router.post(
  '/virtual-card',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Fetch email for Stripe cardholder creation
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { email: true },
      });
      if (!user) {
        res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });
        return;
      }

      const result = await virtualCardService.createVirtualCard(req.userId, user.email);
      res.status(201).json(result);
    } catch (err) {
      if ((err as { code?: string }).code === 'CARD_ALREADY_EXISTS') {
        res.status(409).json({ error: 'User already has a virtual card', code: 'CARD_ALREADY_EXISTS' });
        return;
      }
      next(err);
    }
  },
);

// ─── GET /virtual-card ────────────────────────────────────────────────────────

router.get(
  '/virtual-card',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await virtualCardService.getVirtualCard(req.userId);
      res.json(result);
    } catch (err) {
      if ((err as { code?: string }).code === 'NOT_FOUND') {
        res.status(404).json({ error: 'No virtual card found', code: 'NOT_FOUND' });
        return;
      }
      next(err);
    }
  },
);

export default router;
