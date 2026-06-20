import { cn } from "@/lib/utils";
import type { CaseStatus, AuthMethod, GateStatus, AttentionFlag } from "@/lib/observation-data";
import { CheckCircle2, AlertTriangle, ShieldAlert, Ban, MinusCircle, Circle } from "lucide-react";

export const STATUS_LABEL: Record<CaseStatus, string> = {
  created: "Created",
  in_progress: "In progress",
  needs_human_callback: "Human callback",
  cancelled: "Cancelled",
  not_covered: "Not covered",
  completed: "Completed",
};

const STATUS_DOT: Record<CaseStatus, string> = {
  created: "text-muted-foreground",
  in_progress: "text-primary",
  needs_human_callback: "text-warning",
  cancelled: "text-danger",
  not_covered: "text-danger",
  completed: "text-success",
};

const STATUS_BADGE: Record<CaseStatus, string> = {
  created: "border-border bg-muted text-muted-foreground",
  in_progress: "border-primary/20 bg-primary-soft text-primary",
  needs_human_callback: "border-warning/25 bg-warning-soft text-warning",
  cancelled: "border-danger/25 bg-danger-soft text-danger",
  not_covered: "border-danger/25 bg-danger-soft text-danger",
  completed: "border-success/25 bg-success-soft text-success",
};

export const AUTH_LABEL: Record<AuthMethod, string> = {
  phone_match_pin: "Phone match + PIN",
  full_verification: "Full verification",
  not_policyholder: "Not policyholder",
  unverified: "Unverified",
};

export function StatusDot({ status, pulse }: { status: CaseStatus; pulse?: boolean }) {
  const live = pulse && status === "in_progress";
  return (
    <span
      className={cn(
        "inline-flex h-1.5 w-1.5 rounded-full bg-current",
        STATUS_DOT[status],
        live && "live-pulse",
      )}
    />
  );
}

export function StatusBadge({ status }: { status: CaseStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] font-semibold",
        STATUS_BADGE[status],
      )}
    >
      <StatusDot status={status} pulse />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function CoverageOutcomeBadge({ outcome }: { outcome: "covered" | "not_covered" }) {
  const covered = outcome === "covered";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10.5px] font-semibold",
        covered
          ? "border-success/25 bg-success-soft text-success"
          : "border-danger/25 bg-danger-soft text-danger",
      )}
    >
      {covered ? "Covered" : "Not covered"}
    </span>
  );
}

export function FlagChip({ flag }: { flag: AttentionFlag }) {
  const tone =
    flag === "unsafe" || flag === "auth failed"
      ? "bg-danger-soft text-danger border-danger/20"
      : flag === "no SMS"
      ? "bg-muted text-muted-foreground border-border"
      : "bg-warning-soft text-warning border-warning/20";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-px text-[10.5px] font-medium tracking-tight",
        tone,
      )}
    >
      {flag}
    </span>
  );
}

export function GateIcon({ status }: { status: GateStatus }) {
  switch (status) {
    case "ok":
      return <CheckCircle2 className="size-3.5 text-success" />;
    case "blocked":
      return <Ban className="size-3.5 text-danger" />;
    case "skipped":
      return <MinusCircle className="size-3.5 text-muted-foreground" />;
    case "not_reached":
      return <Circle className="size-3.5 text-border-strong" />;
    case "pending":
      return <AlertTriangle className="size-3.5 text-warning" />;
  }
}

export function GateLabel({ status }: { status: GateStatus }) {
  const map: Record<GateStatus, string> = {
    ok: "passed",
    blocked: "blocked",
    skipped: "skipped",
    not_reached: "not reached",
    pending: "pending",
  };
  const cls: Record<GateStatus, string> = {
    ok: "text-success",
    blocked: "text-danger",
    skipped: "text-muted-foreground",
    not_reached: "text-subtle-fg",
    pending: "text-warning",
  };
  return <span className={cn("text-[12px]", cls[status])}>{map[status]}</span>;
}

export { ShieldAlert };
