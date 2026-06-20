import { useMemo } from "react";
import { CUSTOMERS, SCENARIOS, type Customer, type Scenario, type Stage } from "@/lib/roadside-data";
import { Car, MapPin, Phone, KeyRound, Calendar, User } from "lucide-react";

const FALLBACK_UNKNOWN_DEMO_CUSTOMER: Customer = {
  id: "cust-011",
  name: "Alex Carter",
  birthdate: "1988-02-19",
  phone: "+44 7700 900111",
  pin: "5482",
  pinDigitsAsked: [1, 4],
  tier: "Plus",
  vehicles: [
    {
      id: "veh-011-a",
      policyId: "policy-roadside-plus-001",
      reg: "LX20 ACT",
      make: "Vauxhall",
      model: "Astra",
      year: 2020,
      fuel: "Petrol",
    },
  ],
  suggestedScenarioId: "scenario-flat-tyre-safe",
  suggestedLocation: "I am on Lavender Hill near Clapham Junction, SW11.",
  suggestedSafety: "I am safely off the road and there are no passengers at risk.",
};

type Props = {
  phone: string;
  scenarios: Scenario[];
  customers: Customer[];
  customer: Customer | null;
  selectedVehicleIndex: number;
  setSelectedVehicleIndex: (i: number) => void;
  selectedScenarioId: string;
  setSelectedScenarioId: (id: string) => void;
  currentStage: Stage | null;
};

export function DemoGuide({
  phone,
  scenarios,
  customers,
  customer,
  selectedVehicleIndex,
  setSelectedVehicleIndex,
  selectedScenarioId,
  setSelectedScenarioId,
  currentStage,
}: Props) {
  const availableScenarios = scenarios.length > 0 ? scenarios : SCENARIOS;
  const scenario = useMemo(
    () => availableScenarios.find((s) => s.id === selectedScenarioId) ?? availableScenarios[0] ?? SCENARIOS[0],
    [availableScenarios, selectedScenarioId],
  );
  const isUnknown = !customer;
  const unknownDemoCustomer = useMemo(
    () =>
      customers.find((candidate) => candidate.id === "cust-011") ??
      customers.find((candidate) => candidate.name === "Alex Carter") ??
      FALLBACK_UNKNOWN_DEMO_CUSTOMER,
    [customers],
  );
  const guideCustomer = customer ?? unknownDemoCustomer;

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          <h2 className="text-[13px] font-medium tracking-tight">Presenter guide</h2>
        </div>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Off-screen
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <CallerContext phone={phone} isUnknown={isUnknown} />

        {guideCustomer && (
          <CustomerGuide
            customer={guideCustomer}
            isUnknown={isUnknown}
            selectedVehicleIndex={selectedVehicleIndex}
            setSelectedVehicleIndex={setSelectedVehicleIndex}
          />
        )}

        <Divider label="Suggested call script" />

        <div className="space-y-3 px-5 py-4">
          <div>
            <Label>Scenario</Label>
            <select
              value={selectedScenarioId}
              onChange={(e) => setSelectedScenarioId(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {availableScenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} — {scenarioOutcomeLabel(s)}
                </option>
              ))}
            </select>
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              Expected outcome: {scenarioOutcomeLabel(scenario)}
            </div>
          </div>

          <ScriptLine label="Incident" text={scenario.incidentPhrase} stage="Incident" active={currentStage === "Incident"} />
          <ScriptLine label="Location" text={scenario.locationPhrase} stage="Location" active={currentStage === "Location"} />
        </div>
      </div>
    </aside>
  );
}

function scenarioOutcomeLabel(scenario: Scenario) {
  switch (scenario.coverage) {
    case "Covered":
      return "Covered";
    case "Covered with excess":
      return "Covered + excess";
    case "Not covered":
      return "Not covered";
    case "Human review required":
      return "Not covered";
    case "Security exit":
      return "Security exit";
  }
}

function CallerContext({
  phone,
  isUnknown,
}: {
  phone: string;
  isUnknown: boolean;
}) {
  return (
    <div className="space-y-3 px-5 py-4">
      <Field icon={<Phone className="h-3.5 w-3.5" />} label="Calling from" value={phone || "—"} />
      <Field
        label="Lookup result"
        value={isUnknown ? "No phone match" : "Known policyholder number"}
      />
    </div>
  );
}

function CustomerGuide({
  customer,
  isUnknown,
  selectedVehicleIndex,
  setSelectedVehicleIndex,
}: {
  customer: Customer;
  isUnknown: boolean;
  selectedVehicleIndex: number;
  setSelectedVehicleIndex: (i: number) => void;
}) {
  const pinDigits = isUnknown ? [1, 4] : customer.pinDigitsAsked;

  return (
    <div>
      <Divider label={isUnknown ? "Use this identity" : "Customer"} />

      <div className="space-y-3 px-5 py-4">
        <Field icon={<User className="h-3.5 w-3.5" />} label="Name" value={customer.name} />
        {isUnknown && (
          <Field
            icon={<Calendar className="h-3.5 w-3.5" />}
            label="Birthdate"
            value={customer.birthdate}
          />
        )}
        <div>
          <Label icon={<KeyRound className="h-3.5 w-3.5" />}>Roadside PIN</Label>
          <div className="mt-1.5 flex items-center gap-2">
            {customer.pin.split("").map((d, i) => {
              const pos = i + 1;
              const asked = pinDigits.includes(pos);
              return (
                <div
                  key={i}
                  className={`flex h-8 w-8 items-center justify-center rounded-md border text-sm font-mono ${
                    asked
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                  title={asked ? `Digit ${pos} — agent asks for this` : `Digit ${pos}`}
                >
                  {asked ? d : "•"}
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Agent asks for digits {pinDigits.join(" and ")}.
          </p>
        </div>
      </div>

      <Divider label={customer.vehicles.length > 1 ? "Vehicles" : "Vehicle"} />

      <div className="space-y-3 px-5 py-4">
        <div>
          <Label icon={<Car className="h-3.5 w-3.5" />}>
            {customer.vehicles.length > 1 ? `Choose one (${customer.vehicles.length})` : "Car"}
          </Label>
          <div className="mt-1.5 space-y-1.5">
            {customer.vehicles.map((v, i) => {
              const selected = i === selectedVehicleIndex;
              return (
                <button
                  key={v.reg}
                  type="button"
                  onClick={() => setSelectedVehicleIndex(i)}
                  className={`flex w-full items-center justify-between rounded-md border px-2.5 py-2 text-left text-sm transition-colors ${
                    selected
                      ? "border-primary bg-primary-soft"
                      : "border-border bg-background hover:border-border-strong"
                  }`}
                >
                  <div>
                    <div className="font-medium tracking-tight">
                      {v.make} {v.model}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {v.year} · {v.fuel}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      Coverage: {coverageLabelForVehicle(v.policyName, customer.tier)}
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground">{v.reg}</span>
                </button>
              );
            })}
          </div>
          {customer.vehicles.length > 1 && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Select the vehicle you'll say during the call.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function coverageLabelForVehicle(policyName: string | undefined, tier: Customer["tier"]) {
  return policyName ?? `${tier} cover`;
}

function Field({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <Label icon={icon}>{label}</Label>
      <div className="mt-0.5 text-sm tabular-nums">{value}</div>
    </div>
  );
}

function Label({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
      {icon}
      {children}
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 border-y border-border bg-background px-5 py-2">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function ScriptLine({
  label,
  text,
  active,
}: {
  label: string;
  text: string;
  stage: Stage;
  active: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-2.5 py-2 transition-colors ${
        active ? "border-primary bg-primary-soft" : "border-border bg-background"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <MapPin className="h-3 w-3 text-muted-foreground" />
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 text-sm text-pretty">{text}</p>
    </div>
  );
}

export { CUSTOMERS };
