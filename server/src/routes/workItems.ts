import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth } from "../middleware/auth";
import {
  assignSchema,
  commentSchema,
  createWorkItemSchema,
  listQuerySchema,
  transitionSchema,
  updateWorkItemSchema,
  approvalRequestSchema,
  pageQuerySchema,
  resolveSchema
} from "../validators/workItems";
import {
  assignWorkItem,
  createWorkItem,
  getWorkItem,
  listWorkItems,
  transitionWorkItem,
  updateWorkItem
} from "../services/workItemService";
import { addComment, listComments } from "../services/commentService";
import { requestApproval } from "../services/approvalService";
import { prisma } from "../lib/prisma";
import { serializeActivity } from "../lib/serialize";
import { loadVisible } from "../services/workItemService";
import { listEligibleAssignees } from "../services/teamService";

export const workItemsRouter = Router();
workItemsRouter.use(requireAuth);

workItemsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    const result = await listWorkItems(req.authUser!, query);
    res.json(result);
  })
);

workItemsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createWorkItemSchema.parse(req.body);
    const item = await createWorkItem(req.authUser!, body);
    res.status(201).json({ item });
  })
);

workItemsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await getWorkItem(req.authUser!, req.params.id);
    res.json({ item });
  })
);

workItemsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = updateWorkItemSchema.parse(req.body);
    const item = await updateWorkItem(req.authUser!, req.params.id, body);
    res.json({ item });
  })
);

workItemsRouter.post(
  "/:id/assign",
  asyncHandler(async (req, res) => {
    const body = assignSchema.parse(req.body);
    const item = await assignWorkItem(req.authUser!, req.params.id, body);
    res.json({ item });
  })
);

workItemsRouter.post(
  "/:id/transition",
  asyncHandler(async (req, res) => {
    const body = transitionSchema.parse(req.body);
    const item = await transitionWorkItem(req.authUser!, req.params.id, body);
    res.json({ item });
  })
);

workItemsRouter.post(
  "/:id/resolve",
  asyncHandler(async (req, res) => {
    const body = resolveSchema.parse(req.body);
    const item = await transitionWorkItem(req.authUser!, req.params.id, {
      version: body.version,
      toStatus: "RESOLVED",
      comment: body.comment
    });
    res.json({ item });
  })
);

workItemsRouter.post(
  "/:id/reopen",
  asyncHandler(async (req, res) => {
    const body = resolveSchema.parse(req.body);
    const item = await transitionWorkItem(req.authUser!, req.params.id, {
      version: body.version,
      toStatus: "IN_PROGRESS",
      comment: body.comment
    });
    res.json({ item });
  })
);

workItemsRouter.get(
  "/:id/comments",
  asyncHandler(async (req, res) => {
    const comments = await listComments(req.authUser!, req.params.id);
    res.json({ comments });
  })
);

workItemsRouter.post(
  "/:id/comments",
  asyncHandler(async (req, res) => {
    const body = commentSchema.parse(req.body);
    const comment = await addComment(req.authUser!, req.params.id, body.body);
    res.status(201).json({ comment });
  })
);

workItemsRouter.get(
  "/:id/activity",
  asyncHandler(async (req, res) => {
    await loadVisible(req.authUser!, req.params.id);
    const { page, pageSize } = pageQuerySchema.parse(req.query);
    const where = { workItemId: req.params.id };
    const [total, events] = await Promise.all([
      prisma.activityEvent.count({ where }),
      prisma.activityEvent.findMany({
        where,
        include: { actor: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);
    res.json({
      activity: events.map(serializeActivity),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    });
  })
);

workItemsRouter.post(
  "/:id/approvals",
  asyncHandler(async (req, res) => {
    const body = approvalRequestSchema.parse(req.body);
    const item = await requestApproval(req.authUser!, req.params.id, body);
    res.status(201).json({ item });
  })
);

workItemsRouter.get(
  "/:id/assignees",
  asyncHandler(async (req, res) => {
    const item = await getWorkItem(req.authUser!, req.params.id);
    const assignees = await listEligibleAssignees(req.authUser!, item.team.id);
    res.json({ assignees });
  })
);
