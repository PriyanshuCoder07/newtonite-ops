import { ApprovalStatus, WorkItemStatus, WorkItemType } from "@prisma/client";

export const TYPES_REQUIRING_APPROVAL: WorkItemType[] = [
  "PAYMENT_INVESTIGATION",
  "COMPLIANCE_REQUEST",
  "PRODUCTION_INCIDENT"
];

export const PRIORITY_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 } as const;

export function priorityRank(priority: keyof typeof PRIORITY_RANK) {
  return PRIORITY_RANK[priority];
}

export function requiresApproval(type: WorkItemType) {
  return TYPES_REQUIRING_APPROVAL.includes(type);
}

/**
 * Explicit transition table. Status is never changed by an arbitrary PATCH.
 * Approval outcomes go through the approval service, which calls these helpers.
 */
export const ALLOWED_TRANSITIONS: Record<WorkItemStatus, WorkItemStatus[]> = {
  OPEN: ["IN_PROGRESS", "CLOSED"],
  IN_PROGRESS: ["BLOCKED", "IN_REVIEW", "AWAITING_APPROVAL", "RESOLVED"],
  BLOCKED: ["IN_PROGRESS"],
  IN_REVIEW: ["IN_PROGRESS", "AWAITING_APPROVAL", "RESOLVED"],
  AWAITING_APPROVAL: [], // only approval decisions may leave this state
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: ["IN_PROGRESS"]
};

export function canTransition(from: WorkItemStatus, to: WorkItemStatus) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertCanResolveWithoutApproval(
  type: WorkItemType,
  latestApprovalStatus: ApprovalStatus | null
) {
  if (!requiresApproval(type)) return;
  if (latestApprovalStatus === "APPROVED") return;
  throw new Error("APPROVAL_REQUIRED");
}

export type AttentionKind =
  | "overdue"
  | "blocked"
  | "awaiting_approval"
  | "unassigned"
  | "stale"
  | "start"
  | "review"
  | "close"
  | "none";

export function computeAttention(input: {
  status: WorkItemStatus;
  assigneeId: string | null;
  dueAt: Date | null;
  updatedAt: Date;
  staleAfterHours: number;
  now?: Date;
}): { kind: AttentionKind; label: string } {
  const now = input.now ?? new Date();
  const terminal = input.status === "CLOSED";
  if (terminal) return { kind: "none", label: "Closed — no action required" };

  if (input.dueAt && input.dueAt < now && input.status !== "RESOLVED") {
    return { kind: "overdue", label: "Overdue — needs action" };
  }
  if (input.status === "BLOCKED") {
    return { kind: "blocked", label: "Blocked — unblock or update the blocker" };
  }
  if (input.status === "AWAITING_APPROVAL") {
    return { kind: "awaiting_approval", label: "Waiting for an authorized approver" };
  }
  if (!input.assigneeId) {
    return { kind: "unassigned", label: "Needs an owner" };
  }
  const staleMs = input.staleAfterHours * 60 * 60 * 1000;
  if (now.getTime() - input.updatedAt.getTime() > staleMs && input.status !== "RESOLVED") {
    return { kind: "stale", label: `No updates in ${input.staleAfterHours}+ hours` };
  }
  if (input.status === "OPEN") {
    return { kind: "start", label: "Start progress" };
  }
  if (input.status === "IN_REVIEW") {
    return { kind: "review", label: "Complete review or request approval" };
  }
  if (input.status === "RESOLVED") {
    return { kind: "close", label: "Close the item or reopen if work remains" };
  }
  return { kind: "none", label: "In progress" };
}
