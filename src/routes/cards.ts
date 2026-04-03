import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import * as cardsService from '../services/cards.service';

const router = Router();

// All card routes require authentication
router.use(requireAuth);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const exchangeTokenSchema = z.object({
  publicToken: z.string().min(1, 'publicToken is required'),
  accountId: z.string().min(1, 'accountId is required'),
});

// ─── GET /plaid/link-token ────────────────────────────────────────────────────

router.get(
  '/plaid/link-token',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await cardsService.createLinkToken(req.userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /plaid/exchange-token ───────────────────────────────────────────────

router.post(
  '/plaid/exchange-token',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { publicToken, accountId } = exchangeTokenSchema.parse(req.body);
      const result = await cardsService.exchangeToken(req.userId, publicToken, accountId);
      res.status(201).json(result);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'ACCOUNT_NOT_FOUND') {
        res.status(422).json({ error: 'Account not found in Plaid response', code });
        return;
      }
      if (code === 'CARD_ALREADY_LINKED') {
        res.status(409).json({ error: 'This card is already linked', code });
        return;
      }
      next(err);
    }
  },
);

// ─── GET /cards ───────────────────────────────────────────────────────────────

router.get(
  '/cards',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cards = await cardsService.listCards(req.userId);
      res.json(cards);
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /cards/:id ────────────────────────────────────────────────────────

router.delete(
  '/cards/:id',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      await cardsService.deleteCard(req.userId, req.params.id);
      res.status(204).send();
    } catch (err) {
      if ((err as { code?: string }).code === 'NOT_FOUND') {
        res.status(404).json({ error: 'Card not found', code: 'NOT_FOUND' });
        return;
      }
      next(err);
    }
  },
);

export default router;
