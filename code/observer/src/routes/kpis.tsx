import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  MessageSquare,
  PhoneCall,
  Radio,
  ShieldAlert,
  Wrench,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { useObservedCases } from "@/lib/backend-observation";
import type { ObservedCase } from "@/lib/observation-data";
import { caseTimestamp, coverageOutcome } from "@/components/observation/case-format";
import {
  computeKpiMetrics,
  formatRate,
  gatePassRate,
} from "@/components/observation/kpi-metrics";
import { CoverageOutcomeBadge, STATUS_LABEL, StatusBadge } from "@/components/observation/StatusBits";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/kpis")({
  head: () => ({
    meta: [
      { title: "Aster Roadside · KPIs" },
      { name: "description", content: "Operational KPIs for observed AI-handled roadside cases." },
    ],
  }),
  component: KpiPage,
});

function KpiPage() {
  const { cases, usingFallbackData, error, refreshedAt } = useObservedCases();
  const metrics = computeKpiMetrics(cases);
  const recentCases = cases.slice(0, 5);

  return (
    <div className="flex min-h-screen w-full flex-col bg-surface/40 text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-3">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-sm bg-primary text-primary-foreground">
            <Radio className="size-3" />
          </div>
          <span className="text-[13px] font-semibold tracking-tight text-foreground">
            Aster Roadside
          </span>
          <span className="rounded border border-border bg-surface px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            KPIs
          </span>
        </div>
        <div className="flex items-center gap-2">
          <HealthPill error={error} usingFallbackData={usingFallbackData} refreshedAt={refreshedAt} />
          <Link
            to="/"
            className="inline-flex h-7 items-center gap-1.5 rounded border border-border bg-surface px-2 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2"
          >
            <ArrowLeft className="size-3.5 text-muted-foreground" />
            Back to observation
          </Link>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto flex max-w-7xl flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[18px] font-semibold tracking-tight text-foreground">
                Case performance
              </h1>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                Operational view of automation, coverage, callbacks, and validation quality.
              </p>
            </div>
            <div className="text-right text-[11px] text-subtle-fg">
              {metrics.total} cases in current observation set
            </div>
          </div>

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Total cases"
              value={metrics.total}
              detail={`${metrics.completed} completed`}
              icon={<BarChart3 className="size-4" />}
            />
            <KpiCard
              label="Automation"
              value={formatRate(metrics.automationRate)}
              detail={`${metrics.dispatches} dispatch decisions`}
              icon={<Wrench className="size-4" />}
              tone="success"
            />
            <KpiCard
              label="Human callback"
              value={formatRate(metrics.callbackRate)}
              detail={`${metrics.callbacks} routed cases`}
              icon={<PhoneCall className="size-4" />}
              tone="warning"
            />
            <KpiCard
              label="Coverage approved"
              value={formatRate(metrics.coverageRate)}
              detail={`${metrics.covered} covered · ${metrics.notCovered} not covered`}
              icon={<CheckCircle2 className="size-4" />}
              tone="success"
            />
          </section>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.25fr_0.75fr]">
            <Panel title="Outcome mix">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                {Object.entries(metrics.statusCounts).map(([status, count]) => (
                  <StatusTile
                    key={status}
                    status={status as keyof typeof STATUS_LABEL}
                    count={count}
                    total={metrics.total}
                  />
                ))}
              </div>
            </Panel>

            <Panel title="Customer update">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[24px] font-semibold tracking-tight">
                    {formatRate(metrics.smsRate)}
                  </div>
                  <div className="mt-1 text-[12px] text-muted-foreground">
                    {metrics.smsGenerated} cases generated a customer SMS or confirmation.
                  </div>
                </div>
                <MessageSquare className="size-8 text-primary" />
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <Panel title="Validation quality" className="xl:col-span-2">
              <div className="grid gap-2 md:grid-cols-2">
                <GateMetric
                  label="Identity verified"
                  count={metrics.identityVerified}
                  rate={gatePassRate(cases, (item) => item.gates.identityVerified)}
                />
                <GateMetric
                  label="Dispatchable location"
                  count={metrics.dispatchableLocations}
                  rate={gatePassRate(cases, (item) => item.gates.locationDispatchable)}
                />
                <GateMetric
                  label="Incident classified"
                  count={metrics.classifiedIncidents}
                  rate={gatePassRate(cases, (item) => item.gates.incidentClassified)}
                />
                <GateMetric
                  label="Coverage evaluated"
                  count={metrics.coverageEvaluated}
                  rate={gatePassRate(cases, (item) => item.gates.coverageReviewAllowed)}
                />
              </div>
            </Panel>

            <Panel title="Attention drivers">
              {metrics.attentionCounts.length > 0 ? (
                <div className="space-y-2">
                  {metrics.attentionCounts.slice(0, 5).map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-3">
                      <span className="text-[12.5px] text-foreground">{item.label}</span>
                      <span className="rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[12.5px] text-muted-foreground">No attention flags in this set.</div>
              )}
            </Panel>
          </div>

          <Panel title="Recent outcomes">
            <div className="overflow-hidden rounded border border-border">
              <table className="w-full border-collapse text-left text-[12px]">
                <thead className="bg-surface text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Case</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Outcome</th>
                    <th className="px-3 py-2 font-semibold">Caller</th>
                    <th className="px-3 py-2 text-right font-semibold">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-background">
                  {recentCases.map((item) => (
                    <RecentCaseRow key={item.caseRef} data={item} />
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </main>
    </div>
  );
}

function HealthPill({
  error,
  usingFallbackData,
  refreshedAt,
}: {
  error: string | null;
  usingFallbackData: boolean;
  refreshedAt: Date | null;
}) {
  return (
    <span className="flex items-center gap-1.5 rounded border border-border bg-surface px-2 py-1 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          error ? "bg-danger" : usingFallbackData ? "bg-warning" : "bg-success",
        )}
      />
      {error
        ? "Backend offline"
        : usingFallbackData
          ? "Demo fallback"
          : refreshedAt
            ? `Live · ${refreshedAt.toLocaleTimeString()}`
            : "Live"}
    </span>
  );
}

function KpiCard({
  label,
  value,
  detail,
  icon,
  tone = "primary",
}: {
  label: string;
  value: ReactNode;
  detail: string;
  icon: ReactNode;
  tone?: "primary" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    primary: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  }[tone];

  return (
    <section className="rounded-md border border-border bg-background px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {label}
          </div>
          <div className="mt-2 text-[26px] font-semibold tracking-tight text-foreground">{value}</div>
        </div>
        <div className={cn("rounded p-2", toneClass)}>{icon}</div>
      </div>
      <div className="mt-2 text-[12px] text-muted-foreground">{detail}</div>
    </section>
  );
}

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-md border border-border bg-background px-4 py-3.5", className)}>
      <h2 className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function StatusTile({
  status,
  count,
  total,
}: {
  status: keyof typeof STATUS_LABEL;
  count: number;
  total: number;
}) {
  return (
    <div className="rounded border border-border bg-surface px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={status} />
        <span className="font-mono text-[13px] font-semibold text-foreground">{count}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${total > 0 ? Math.round((count / total) * 100) : 0}%` }}
        />
      </div>
    </div>
  );
}

function GateMetric({ label, count, rate }: { label: string; count: number; rate: number }) {
  return (
    <div className="rounded border border-border bg-surface px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12.5px] font-medium text-foreground">{label}</span>
        <span className="font-mono text-[12px] text-muted-foreground">{count}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-success" style={{ width: formatRate(rate) }} />
        </div>
        <span className="w-9 text-right font-mono text-[11px] text-muted-foreground">
          {formatRate(rate)}
        </span>
      </div>
    </div>
  );
}

function RecentCaseRow({ data }: { data: ObservedCase }) {
  const timestamp = caseTimestamp(data);
  const outcome = coverageOutcome(data);
  const icon =
    data.status === "completed" ? (
      <CheckCircle2 className="size-3.5 text-success" />
    ) : data.status === "needs_human_callback" ? (
      <PhoneCall className="size-3.5 text-warning" />
    ) : data.status === "cancelled" ? (
      <ShieldAlert className="size-3.5 text-danger" />
    ) : data.status === "not_covered" ? (
      <ShieldAlert className="size-3.5 text-danger" />
    ) : (
      <Activity className="size-3.5 text-primary" />
    );

  return (
    <tr className="hover:bg-surface/70">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-mono text-[12px] font-medium text-foreground">{data.caseRef}</span>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <StatusBadge status={data.status} />
      </td>
      <td className="px-3 py-2.5">
        {outcome ? (
          <CoverageOutcomeBadge outcome={outcome} />
        ) : data.status === "needs_human_callback" ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-warning">
            <PhoneCall className="size-3" />
            Callback
          </span>
        ) : data.status === "cancelled" ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-danger">
            <XCircle className="size-3" />
            Cancelled
          </span>
        ) : data.status === "not_covered" ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-danger">
            <XCircle className="size-3" />
            Not covered
          </span>
        ) : (
          <span className="text-[12px] text-muted-foreground">Pending</span>
        )}
      </td>
      <td className="max-w-[240px] truncate px-3 py-2.5 text-[12px] text-foreground">
        {data.callerLabel}
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="font-mono text-[11.5px] text-foreground">{timestamp.time}</div>
        <div className="text-[10.5px] text-subtle-fg">{timestamp.date}</div>
      </td>
    </tr>
  );
}
