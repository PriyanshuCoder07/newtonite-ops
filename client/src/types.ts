export type PlatformRole = "ADMIN" | "USER";
export type TeamRole = "MANAGER" | "MEMBER" | "VIEWER";
export type WorkItemType =
  | "CUSTOMER_ISSUE"
  | "ENGINEERING_PROBLEM"
  | "PAYMENT_INVESTIGATION"
  | "PRODUCTION_INCIDENT"
  | "COMPLIANCE_REQUEST"
  | "OPERATIONAL_TASK";
export type WorkItemStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "IN_REVIEW"
  | "AWAITING_APPROVAL"
  | "RESOLVED"
  | "CLOSED";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type User = {
  id: string;
  email: string;
  name: string;
  platformRole: PlatformRole;
  isActive: boolean;
};

export type AuthUser = User & {
  memberships: { teamId: string; teamName: string; teamSlug: string; role: TeamRole }[];
};

export type WorkItem = {
  id: string;
  reference: string;
  title: string;
  description: string;
  type: WorkItemType;
  status: WorkItemStatus;
  priority: Priority;
  version: number;
  dueAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  team: { id: string; name: string; slug: string };
  creator: User;
  assignee: User | null;
  attention: { kind: string; label: string };
  pendingApproval: { id: string; status: string; requestedAt: string } | null;
};

export type Comment = {
  id: string;
  body: string;
  createdAt: string;
  author: User;
};

export type Activity = {
  id: string;
  type: string;
  field: string | null;
  previousValue: string | null;
  newValue: string | null;
  summary: string;
  createdAt: string;
  actor: User;
  workItem?: { id: string; reference: string; title: string };
};

export type Approval = {
  id: string;
  status: string;
  requestComment: string | null;
  decisionComment: string | null;
  requestedAt: string;
  decidedAt: string | null;
  requestedBy: { id: string; name: string; email: string };
  decidedBy: { id: string; name: string; email: string } | null;
  workItem: WorkItem;
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  workItemId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type ActivityPage = {
  activity: Activity[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
