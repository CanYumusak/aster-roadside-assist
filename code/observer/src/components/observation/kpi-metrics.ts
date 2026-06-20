import type { CaseStatus, GateStatus, ObservedCase } from "@/lib/observation-data";
import { coverageOutcome } from "./case-format";

export type KpiMetrics = {
  total: number;
  completed: number;
  covered: number;
  notCovered: number;
  callbacks: number;
  safetyStops: number;
  blocked: number;
  dispatches: number;
  smsGenerated: number;
  coverageEvaluated: number;
  identityVerified: number;
  dispatchableLocations: number;
  classifiedIncidents: number;
  callbackRate: number;
  coverageRate: number;
  automationRate: number;
  smsRate: number;
  statusCounts: Record<CaseStatus, number>;
  attentionCounts: Array<{ label: string; count: number }>;
};

const STATUSES: CaseStatus[] = [
  "created",
  "in_progress",
  "needs_human_callback",
  "cancelled",
  "not_covered",
  "completed",
];

export function computeKpiMetrics(cases: ObservedCase[]): KpiMetrics {
  const total = cases.length;
  const covered = cases.filter((item) => coverageOutcome(item) === "covered").length;
  const notCovered = cases.filter((item) => coverageOutcome(item) === "not_covered").length;
  const completed = cases.filter((item) => item.status === "completed").length;
  const callbacks = cases.filter((item) => item.status === "needs_human_callback").length;
  const safetyStops = cases.filter(
    (item) => item.status === "cancelled" && item.attentionFlags.includes("unsafe"),
  ).length;
  const blocked = cases.filter((item) => item.status === "not_covered").length;
  const dispatches = cases.filter((item) => item.nextAction?.evaluated).length;
  const smsGenerated = cases.filter((item) => item.gates.smsGenerated === "ok").length;
  const coverageEvaluated = cases.filter((item) => item.coverage?.evaluated).length;
  const identityVerified = cases.filter((item) => item.gates.identityVerified === "ok").length;
  const dispatchableLocations = cases.filter((item) => item.gates.locationDispatchable === "ok").length;
  const classifiedIncidents = cases.filter((item) => item.gates.incidentClassified === "ok").length;
  const statusCounts = Object.fromEntries(
    STATUSES.map((status) => [status, cases.filter((item) => item.status === status).length]),
  ) as Record<CaseStatus, number>;

  const attentionCounts = Array.from(
    cases
      .flatMap((item) => item.attentionFlags)
      .reduce((counts, flag) => counts.set(flag, (counts.get(flag) ?? 0) + 1), new Map<string, number>()),
  )
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    total,
    completed,
    covered,
    notCovered,
    callbacks,
    safetyStops,
    blocked,
    dispatches,
    smsGenerated,
    coverageEvaluated,
    identityVerified,
    dispatchableLocations,
    classifiedIncidents,
    callbackRate: ratio(callbacks, total),
    coverageRate: ratio(covered, covered + notCovered),
    automationRate: ratio(dispatches, total),
    smsRate: ratio(smsGenerated, total),
    statusCounts,
    attentionCounts,
  };
}

export function gatePassRate(cases: ObservedCase[], selector: (item: ObservedCase) => GateStatus) {
  return ratio(
    cases.filter((item) => selector(item) === "ok").length,
    cases.length,
  );
}

export function formatRate(value: number) {
  return `${Math.round(value * 100)}%`;
}

function ratio(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}
