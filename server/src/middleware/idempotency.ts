import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";

const MUTATING = new Set(["POST", "PATCH", "PUT"]);

export async function idempotency(req: Request, res: Response, next: NextFunction) {
  try {
    const key = req.header("Idempotency-Key");
    if (!key || !MUTATING.has(req.method) || !req.authUser) return next();

    const existing = await prisma.idempotencyKey.findUnique({
      where: { userId_key: { userId: req.authUser.id, key } }
    });
    const path = req.originalUrl.split("?")[0];
    if (existing) {
      // A key identifies ONE logical request. Reusing it for a different endpoint is a client
      // bug; replaying the stored response would hide it.
      if (existing.method !== req.method || existing.path !== path) {
        return res.status(422).json({
          error: {
            code: "idempotency_key_reuse",
            message: "This Idempotency-Key was already used for a different request"
          }
        });
      }
      res.status(existing.statusCode);
      res.setHeader("Idempotency-Replayed", "true");
      return res.json(JSON.parse(existing.response));
    }

    req.idempotencyKey = key;
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const statusCode = res.statusCode || 200;
      // Only successful (2xx) outcomes are memoised. Errors are deliberately NOT stored: a user who
      // fixes a validation error (or retries after a 409) must get the request re-evaluated.
      if (req.authUser && req.idempotencyKey && statusCode >= 200 && statusCode < 300) {
        // Persist the outcome BEFORE the client sees the response, so a retry sent after a
        // timeout can never miss the stored result. Storage failure must not fail the request.
        prisma.idempotencyKey
          .create({
            data: {
              userId: req.authUser.id,
              key: req.idempotencyKey,
              method: req.method,
              path,
              statusCode,
              response: JSON.stringify(body)
            }
          })
          .catch(() => undefined)
          .finally(() => originalJson(body));
        return res;
      }
      return originalJson(body);
    }) as typeof res.json;
    next();
  } catch (err) {
    next(err);
  }
}
