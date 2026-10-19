import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { AppError, ValidationError } from "../lib/errors";
import { env } from "../config/env";
import { ZodError } from "zod";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "validation_error",
        message: "Request validation failed",
        details: err.flatten()
      }
    });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? undefined
      }
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: { code: "not_found", message: "Resource not found" } });
    }
    if (err.code === "P2002") {
      return res.status(409).json({
        error: {
          code: "conflict",
          message: "A conflicting record already exists"
        }
      });
    }
  }

  if (err instanceof ValidationError) {
    return res.status(400).json({
      error: { code: err.code, message: err.message, details: err.details }
    });
  }

  console.error("[unhandled]", err instanceof Error ? err.message : err);
  return res.status(500).json({
    error: {
      code: "internal_error",
      message: env.isProd ? "An unexpected error occurred" : err instanceof Error ? err.message : "Unknown error"
    }
  });
}
