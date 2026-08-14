import type { NextFunction, Request, Response } from "express";

interface RateBucket {
  count: number;
  resetAt: number;
}

export function rateLimiter(limit: number, windowMs: number) {
  const buckets = new Map<string, RateBucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    bucket.count++;
    if (bucket.count > limit) {
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    next();
  };
}
