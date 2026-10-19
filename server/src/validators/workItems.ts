import { z } from "zod";

export const workItemTypeSchema = z.enum([
  "CUSTOMER_ISSUE",
  "ENGINEERING_PROBLEM",
  "PAYMENT_INVESTIGATION",
  "PRODUCTION_INCIDENT",
  "COMPLIANCE_REQUEST",
  "OPERATIONAL_TASK"
]);

export const workItemStatusSchema = z.enum([
  "OPEN",
  "IN_PROGRESS",
  "BLOCKED",
  "IN_REVIEW",
  "AWAITING_APPROVAL",
  "RESOLVED",
  "CLOSED"
]);

export const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export const createWorkItemSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(8000),
  type: workItemTypeSchema,
  priority: prioritySchema.default("MEDIUM"),
  teamId: z.string().min(1),
  assigneeId: z.string().min(1).optional().nullable(),
  dueAt: z.string().datetime().optional().nullable()
});

export const updateWorkItemSchema = z.object({
  version: z.number().int().positive(),
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().min(10).max(8000).optional(),
  priority: prioritySchema.optional(),
  dueAt: z.string().datetime().nullable().optional()
});

export const assignSchema = z.object({
  version: z.number().int().positive(),
  assigneeId: z.string().min(1).nullable()
});

export const transitionSchema = z.object({
  version: z.number().int().positive(),
  toStatus: workItemStatusSchema,
  comment: z.string().trim().max(2000).optional()
});

export const commentSchema = z.object({
  body: z.string().trim().min(1).max(4000)
});

export const resolveSchema = z.object({
  version: z.number().int().positive(),
  comment: z.string().trim().max(2000).optional()
});

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(30)
});

export const approvalListQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional()
});

export const approvalRequestSchema = z.object({
  version: z.number().int().positive(),
  comment: z.string().trim().max(2000).optional()
});

export const approvalDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: z.string().trim().max(2000).optional()
});

export const listQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.union([workItemStatusSchema, z.array(workItemStatusSchema)]).optional(),
  priority: z.union([prioritySchema, z.array(prioritySchema)]).optional(),
  type: z.union([workItemTypeSchema, z.array(workItemTypeSchema)]).optional(),
  teamId: z.string().optional(),
  assigneeId: z.string().optional(),
  creatorId: z.string().optional(),
  unassigned: z.enum(["true", "false"]).optional(),
  overdue: z.enum(["true", "false"]).optional(),
  stale: z.enum(["true", "false"]).optional(),
  mine: z.enum(["true", "false"]).optional(),
  dueBefore: z.string().datetime().optional(),
  dueAfter: z.string().datetime().optional(),
  updatedBefore: z.string().datetime().optional(),
  updatedAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  createdAfter: z.string().datetime().optional(),
  sort: z
    .enum([
      "updated_desc",
      "updated_asc",
      "priority_desc",
      "due_asc",
      "created_desc",
      "created_asc"
    ])
    .optional()
    .default("updated_desc"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20)
});
