import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  BLOCKED: "Blocked",
  IN_REVIEW: "In Review",
  AWAITING_APPROVAL: "Awaiting Approval",
  RESOLVED: "Resolved",
  CLOSED: "Closed"
};

export const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical"
};

export const TYPE_LABEL: Record<string, string> = {
  CUSTOMER_ISSUE: "Customer Issue",
  ENGINEERING_PROBLEM: "Engineering Problem",
  PAYMENT_INVESTIGATION: "Payment Investigation",
  PRODUCTION_INCIDENT: "Production Incident",
  COMPLIANCE_REQUEST: "Compliance Request",
  OPERATIONAL_TASK: "Operational Task"
};
