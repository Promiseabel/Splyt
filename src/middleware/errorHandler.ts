import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation error',
      code: 'VALIDATION_ERROR',
      details: err.flatten().fieldErrors,
    });
    return;
  }

  if (err instanceof Error) {
    console.error(`[ERROR] ${err.message}`, { stack: err.stack });
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    return;
  }

  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
}
