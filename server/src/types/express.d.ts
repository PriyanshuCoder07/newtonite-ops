import type { AuthUser } from "../lib/publicUser";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      idempotencyKey?: string;
    }
  }
}

export {};
