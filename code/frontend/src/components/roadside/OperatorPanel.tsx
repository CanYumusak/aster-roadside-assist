import { useMemo } from "react";
import type { CallState, Customer, Scenario, Stage } from "@/lib/roadside-data";
import { STAGES } from "@/lib/roadside-data";
import { Terminal } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  customer: Customer | null;
  scenario: Scenario;
  selectedVehicleIndex: number;
  callState: CallState;
  stageIndex: number;
  caseRef: string;
  callerPhone: string;
};

const UNKNOWN_VERIFICATION = {
  name: "Alex Carter",
  birthdate: "1988-02-19",
  pin: "5482",
  pinDigitsAsked: [1, 4],
};

export function OperatorPanel({
  open,
  onClose,
  customer,
  scenario,
  selectedVehicleIndex,
  callState,
  stageIndex,
  caseRef,
  callerPhone,
}: Props) {
  const vehicle = customer?.vehicles[selectedVehicleIndex];

  const transcript = useMemo(() => {
    const lines: { who: "agent" | "caller"; text: string; stage: Stage }[] = [];
    lines.push({ who: "agent", text: "Aster Roadside, you're through to the assistance line. Can I take the number you're calling from?", stage: "Lookup" });
    lines.push({ who: "caller", text: callerPhone || "—", stage: "Lookup" });
    if (customer) {
      lines.push({ who: "agent", text: `Thanks. I can see you're calling from a known policyholder number. For security, can I take digits ${customer.pinDigitsAsked.join(" and ")} of your roadside PIN?`, stage: "Verify" });
      lines.push({ who: "caller", text: `${pinDigitsFor(customer)}.`, stage: "Verify" });
    } else {
      lines.push({ who: "agent", text: "I can't find a policy on that number. For verification, can I take your full name, date of birth, and digits 1 and 4 of your roadside PIN?", stage: "Verify" });
      lines.push({ who: "caller", text: `${UNKNOWN_VERIFICATION.name}, ${UNKNOWN_VERIFICATION.birthdate}, digits 1 and 4 are ${pinDigitsForUnknown()}.`, stage: "Verify" });
    }
    lines.push({ who: "agent", text: "Before we go on — is everyone safe? Are you out of live traffic?", stage: "Safety" });
    lines.push({ who: "caller", text: scenario.safetyPhrase, stage: "Safety" });
    lines.push({ who: "agent", text: "Where are you right now?", stage: "Location" });
    lines.push({ who: "caller", text: scenario.locationPhrase, stage: "Location" });
    if (vehicle) {
      lines.push({ who: "agent", text: "Which vehicle on your policy are you in today?", stage: "Vehicle" });
      lines.push({ who: "caller", text: `The ${vehicle.make} ${vehicle.model}, ${vehicle.reg}.`, stage: "Vehicle" });
    }
    lines.push({ who: "agent", text: "Tell me what happened.", stage: "Incident" });
    lines.push({ who: "caller", text: scenario.incidentPhrase, stage: "Incident" });
    return lines;
  }, [customer, scenario, vehicle, callerPhone]);

  const visible = transcript.filter((l) => STAGES.indexOf(l.stage) <= stageIndex);

  const facts = {
    caller_phone: callerPhone,
    phone_lookup: customer ? "known_policyholder_number" : "unknown_number",
    identified: customer?.name ?? UNKNOWN_VERIFICATION.name,
    dob: customer?.birthdate ?? UNKNOWN_VERIFICATION.birthdate,
    auth_method: customer ? "phone_match_and_pin_digits" : "name_birthdate_pin_digits",
    pin_verified: customer ? customer.pinDigitsAsked : UNKNOWN_VERIFICATION.pinDigitsAsked,
    discard_on_auth_mismatch: true,
    vehicle: vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.reg})` : null,
    fuel: vehicle?.fuel ?? null,
    location: STAGES.indexOf("Location") <= stageIndex ? scenario.locationPhrase : null,
    safety_confirmed: STAGES.indexOf("Safety") <= stageIndex ? true : null,
    incident: STAGES.indexOf("Incident") <= stageIndex ? scenario.incidentPhrase : null,
  };

  const completeness = Math.min(100, Math.round(((stageIndex + 1) / STAGES.length) * 100));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-2xl flex-col border-l border-border bg-background shadow-xl fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            <h2 className="text-[13px] font-medium tracking-tight">Operator view</h2>
            <span className="ml-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              internal · not customer-facing
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-border px-2 py-1 text-[12px] hover:bg-accent"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Section title="Authentication">
            <Row k="Auth mode" v={customer ? "Known policyholder number + PIN digits" : "Name + DOB + PIN digits"} />
            <Row k="Mismatch handling" v="Discard + human callback" tone="warn" />
            <Row k="Case ref" v={caseRef} mono />
            <Row k="Call state" v={callState} />
          </Section>

          <Section title="Extracted facts">
            <pre className="overflow-x-auto rounded-md border border-border bg-surface px-3 py-2.5 text-[12px] font-mono leading-relaxed">
{JSON.stringify(facts, null, 2)}
            </pre>
          </Section>

          <Section title={`Intake completeness · ${completeness}%`}>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${completeness}%` }}
              />
            </div>
          </Section>

          <Section title="Coverage decision trace">
            <ol className="space-y-1.5 text-[12.5px]">
              <Trace
                ok
                text={customer ? "Inbound caller number matched a known policyholder" : "Identity claim checked with name + DOB + requested PIN digits"}
                warn={!customer && "Unknown number uses full verification"}
              />
              <Trace ok text={customer ? "PIN digits accepted; mismatch would discard intake" : "Fallback fields accepted in prototype; mismatch would discard intake after 3 attempts"} />
              <Trace ok text={`Tier: ${customer?.tier ?? "—"}`} />
              <Trace ok text={`Incident classified: ${scenario.title}`} />
              <Trace
                ok={scenario.coverage !== "Human review required"}
                text={`Coverage: ${scenario.coverage}`}
                warn={scenario.coverage === "Human review required" && "Routing to human handler"}
              />
            </ol>
          </Section>

          <Section title="Next best action">
            <div className="rounded-md border border-primary/30 bg-primary-soft px-3 py-2.5 text-[13px]">
              Dispatch <span className="font-medium">{scenario.action}</span> · {scenario.provider} · ETA {scenario.etaMinutes}m
            </div>
          </Section>

          <Section title="Blocked actions">
            <ul className="space-y-1 text-[12.5px] text-muted-foreground">
              <li>· No alternate fallback by policy number, registration, or postcode</li>
              <li>· Auth mismatch discards intake and routes to human callback</li>
              <li>· No policy changes during call</li>
              <li>· No payment capture over voice</li>
              <li>· No PII read-back beyond confirmed fields</li>
            </ul>
          </Section>

          <Section title="Final SMS payload">
            <pre className="overflow-x-auto rounded-md border border-border bg-surface px-3 py-2.5 text-[12px] font-mono leading-relaxed">
{JSON.stringify({
  to: customer?.phone ?? callerPhone,
  template: "roadside_dispatch_v3",
  vars: {
    first_name: customer?.name?.split(" ")[0] ?? "Customer",
    action: scenario.action,
    provider: scenario.provider,
    eta_minutes: scenario.etaMinutes,
    case_ref: caseRef,
    coverage: scenario.coverage,
  },
}, null, 2)}
            </pre>
          </Section>

          <Section title="Transcript">
            <div className="space-y-2">
              {visible.map((l, i) => (
                <div key={i} className="grid grid-cols-[64px_1fr] gap-3 border-t border-border pt-2 first:border-t-0 first:pt-0">
                  <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                    {l.who}
                    <div className="mt-0.5 text-[10px] text-muted-foreground/70">{l.stage}</div>
                  </div>
                  <div className="text-[13px] text-pretty">{l.text}</div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function pinDigitsFor(customer: Customer): string {
  return customer.pinDigitsAsked
    .map((position) => customer.pin[position - 1])
    .filter(Boolean)
    .join(" and ");
}

function pinDigitsForUnknown(): string {
  return UNKNOWN_VERIFICATION.pinDigitsAsked
    .map((position) => UNKNOWN_VERIFICATION.pin[position - 1])
    .filter(Boolean)
    .join(" and ");
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border px-6 py-4">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({
  k,
  v,
  mono,
  tone,
}: {
  k: string;
  v: string;
  mono?: boolean;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-1.5 text-[13px] last:border-b-0">
      <span className="text-muted-foreground">{k}</span>
      <span
        className={`capitalize ${mono ? "font-mono" : ""} ${
          tone === "warn" ? "text-destructive" : tone === "ok" ? "text-[color:var(--success)]" : ""
        }`}
      >
        {v}
      </span>
    </div>
  );
}

function Trace({ ok, text, warn }: { ok: boolean; text: string; warn?: string | false }) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
          warn ? "bg-warning" : ok ? "bg-[color:var(--success)]" : "bg-border-strong"
        }`}
      />
      <div>
        <div>{text}</div>
        {warn && <div className="text-[11.5px] text-[color:oklch(0.5_0.13_75)]">{warn}</div>}
      </div>
    </li>
  );
}
