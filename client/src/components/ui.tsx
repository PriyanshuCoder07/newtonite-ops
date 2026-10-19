import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn, PRIORITY_LABEL, STATUS_LABEL, TYPE_LABEL } from "../lib/cn";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-accent text-white hover:bg-accent-700 disabled:bg-ink-300",
    secondary: "bg-white text-ink-800 border border-ink-200 hover:bg-ink-50",
    ghost: "bg-transparent text-ink-700 hover:bg-ink-100",
    danger: "bg-red-600 text-white hover:bg-red-700"
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400",
        props.className
      )}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400",
        props.className
      )}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900",
        props.className
      )}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-500">{children}</label>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border border-ink-200 bg-white shadow-sm", className)}>{children}</div>;
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    OPEN: "bg-ink-100 text-ink-700",
    IN_PROGRESS: "bg-blue-50 text-blue-800",
    BLOCKED: "bg-orange-50 text-orange-800",
    IN_REVIEW: "bg-violet-50 text-violet-800",
    AWAITING_APPROVAL: "bg-amber-50 text-amber-900",
    RESOLVED: "bg-emerald-50 text-emerald-800",
    CLOSED: "bg-ink-200 text-ink-600"
  };
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", colors[status] ?? "bg-ink-100")}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    LOW: "text-ink-500",
    MEDIUM: "text-ink-700",
    HIGH: "text-orange-700",
    CRITICAL: "text-red-700"
  };
  return <span className={cn("text-xs font-semibold uppercase tracking-wide", colors[priority])}>{PRIORITY_LABEL[priority]}</span>;
}

export function TypeLabel({ type }: { type: string }) {
  return <span className="text-sm text-ink-600">{TYPE_LABEL[type] ?? type}</span>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-ink-200 bg-white px-6 py-16 text-center">
      <h3 className="text-base font-semibold text-ink-800">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-ink-500">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-ink-200 border-t-accent" />;
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-white">
      {initials}
    </span>
  );
}

export function Modal({
  open,
  title,
  children,
  onClose
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-800" aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
      {message}
    </div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      {message}
    </div>
  );
}
