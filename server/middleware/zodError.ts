import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function zodErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }
  next(err);
}
