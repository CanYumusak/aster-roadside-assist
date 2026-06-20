import { cn } from "@/lib/utils";
import type { ObservedCase } from "@/lib/observation-data";
import { caseTimestamp, coverageOutcome } from "./case-format";
import { AUTH_LABEL, CoverageOutcomeBadge, GateIcon, GateLabel, STATUS_LABEL } from "./StatusBits";
import { MessageSquare, ShieldAlert, Wrench } from "lucide-react";

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-md border border-border bg-background px-4 py-3.5",
        className,
      )}
    >
      <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[11.5px] text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-right text-[12.5px] text-foreground",
          mono && "font-mono text-[12px]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

const NotCaptured = () => <span className="text-subtle-fg italic">Not captured</span>;

export function InspectorGrid({ data }: { data: ObservedCase }) {
  const g = data.gates;
  const showVehicle = data.vehicleConfirmed && data.vehicleLabel;
  const isUnsafeStop =
    data.status === "cancelled" && data.attentionFlags.includes("unsafe");
  const timestamp = caseTimestamp(data);
  const outcome = coverageOutcome(data);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      <Section title="Case summary">
        <Row label="Case ref" value={data.caseRef} mono />
        <Row label="Status" value={STATUS_LABEL[data.status]} />
        <Row label="Stage" value={data.stage} />
        <Row label="Time" value={timestamp.time} mono />
        <Row label="Date" value={timestamp.date} />
        {outcome && <Row label="Coverage outcome" value={<CoverageOutcomeBadge outcome={outcome} />} />}
        {data.outcomeReason && <Row label="Outcome" value={data.outcomeReason} />}
      </Section>

      <Section title="Authentication">
        <Row label="Method" value={AUTH_LABEL[data.authMethod]} />
        <Row
          label="Result"
          value={
            g.identityVerified === "ok"
              ? "Verified"
              : g.identityVerified === "blocked"
              ? "Failed"
              : g.identityVerified === "pending"
              ? "In progress"
              : "Not reached"
          }
        />
        {data.pinAttempts && <Row label="PIN attempts" value={data.pinAttempts} mono />}
      </Section>

      <Section title="Extracted facts">
        <Row label="Name" value={data.policyholderName ?? <NotCaptured />} />
        <Row label="Caller phone" value={data.callerPhone} mono />
        {showVehicle && <Row label="Vehicle" value={data.vehicleLabel} />}
        <Row label="Location" value={data.location ?? <NotCaptured />} />
        <Row label="Incident" value={data.incident ?? <NotCaptured />} />
        <Row
          label="Safety"
          value={
            g.safetyChecked === "ok"
              ? "Safe / off road"
              : g.safetyChecked === "blocked"
              ? "Unsafe — in traffic"
              : "Not yet checked"
          }
        />
      </Section>

      <Section title="Validation gates">
        <div className="space-y-1">
          {[
            ["Safety checked", g.safetyChecked],
            ["Identity verified", g.identityVerified],
            ["Vehicle confirmed", g.vehicleConfirmed],
            ["Location dispatchable", g.locationDispatchable],
            ["Incident classified", g.incidentClassified],
            ["Coverage review allowed", g.coverageReviewAllowed],
            ["SMS generated", g.smsGenerated],
          ].map(([label, status]) => (
            <div key={label as string} className="flex items-center justify-between gap-3 py-0.5">
              <div className="flex items-center gap-2">
                <GateIcon status={status as any} />
                <span className="text-[12.5px] text-foreground">{label}</span>
              </div>
              <GateLabel status={status as any} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Coverage trace">
        {data.coverage?.evaluated ? (
          <>
            <Row label="Policy" value={data.coverage.policy} mono />
            <div className="mt-2 space-y-1">
              {data.coverage.rules?.map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-3 py-0.5">
                  <span className="text-[12.5px] text-foreground">{r.label}</span>
                  <span
                    className={cn(
                      "text-[11.5px]",
                      r.result === "pass" && "text-success",
                      r.result === "fail" && "text-danger",
                      r.result === "n/a" && "text-muted-foreground",
                    )}
                  >
                    {r.result === "pass" ? "passed" : r.result === "fail" ? "failed" : "n/a"}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="text-[12.5px] text-foreground">Coverage not evaluated</div>
            <div className="mt-0.5 text-[11.5px] text-muted-foreground">
              {data.coverage?.reason}
            </div>
          </>
        )}
      </Section>

      <Section title="Next best action">
        {data.nextAction?.evaluated ? (
          <div className="flex items-start gap-2.5 rounded border border-border bg-surface px-3 py-2.5">
            <Wrench className="mt-0.5 size-3.5 text-primary" />
            <div className="flex-1">
              <div className="text-[13px] font-medium text-foreground">
                {data.nextAction.actionType}
              </div>
              <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                {data.nextAction.provider} · ETA {data.nextAction.eta}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="text-[12.5px] text-foreground">No dispatch decision</div>
            <div className="mt-0.5 text-[11.5px] text-muted-foreground">
              {data.nextAction?.reason}
            </div>
          </>
        )}
      </Section>

      <Section title="Customer update" className="md:col-span-2 xl:col-span-3">
        {isUnsafeStop ? (
          <div className="flex items-start gap-2.5 rounded border border-danger/20 bg-danger-soft px-3 py-2.5">
            <ShieldAlert className="mt-0.5 size-3.5 text-danger" />
            <div className="text-[12px] leading-relaxed text-foreground">
              <span className="font-medium">No SMS sent.</span>{" "}
              <span className="text-muted-foreground">
                The call ended because roadside intake cannot continue until everyone is safe.
              </span>
            </div>
          </div>
        ) : data.smsPreview ? (
          <div className="rounded border border-border bg-surface px-3 py-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide text-muted-foreground">
              <MessageSquare className="size-3" />
              Simulated SMS
            </div>
            <p className="text-[12.5px] leading-relaxed text-foreground">{data.smsPreview}</p>
          </div>
        ) : (
          <div className="text-[12px] text-muted-foreground">Awaiting outcome</div>
        )}
      </Section>
    </div>
  );
}
