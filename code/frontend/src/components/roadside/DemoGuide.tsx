import { useMemo } from "react";
import { CUSTOMERS, SCENARIOS, type Customer, type Stage } from "@/lib/roadside-data";
import { ShieldAlert, AlertTriangle, Car, MapPin, Phone, KeyRound, Calendar, User } from "lucide-react";

type Props = {
  phone: string;
  customer: Customer | null;
  selectedVehicleIndex: number;
  setSelectedVehicleIndex: (i: number) => void;
  selectedScenarioId: string;
  setSelectedScenarioId: (id: string) => void;
  currentStage: Stage | null;
};

export function DemoGuide({
  phone,
  customer,
  selectedVehicleIndex,
  setSelectedVehicleIndex,
  selectedScenarioId,
  setSelectedScenarioId,
  currentStage,
}: Props) {
  const scenario = useMemo(
    () => SCENARIOS.find((s) => s.id === selectedScenarioId) ?? SCENARIOS[0],
    [selectedScenarioId],
  );
  const isUnknown = !customer;

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
        {isUnknown ? (
          <UnknownGuide phone={phone} />
        ) : (
          <KnownGuide
            customer={customer}
            selectedVehicleIndex={selectedVehicleIndex}
            setSelectedVehicleIndex={setSelectedVehicleIndex}
          />
        )}

        <Divider label="Suggested call script" />

        <div className="space-y-3 px-5 py-4">
          <div>
            <Label icon={<AlertTriangle className="h-3.5 w-3.5" />}>Scenario</Label>
            <select
              value={selectedScenarioId}
              onChange={(e) => setSelectedScenarioId(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>

          <ScriptLine label="Incident" text={scenario.incidentPhrase} stage="Incident" active={currentStage === "Incident"} />
          <ScriptLine label="Safety" text={scenario.safetyPhrase} stage="Safety" active={currentStage === "Safety"} />
          <ScriptLine label="Location" text={scenario.locationPhrase} stage="Location" active={currentStage === "Location"} />
        </div>
      </div>
    </aside>
  );
}

function KnownGuide({
  customer,
  selectedVehicleIndex,
  setSelectedVehicleIndex,
}: {
  customer: Customer;
  selectedVehicleIndex: number;
  setSelectedVehicleIndex: (i: number) => void;
}) {
  return (
    <div>
      <div className="px-5 py-4">
        <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary-soft px-3 py-2.5">
          <Phone className="mt-0.5 h-3.5 w-3.5 text-primary" />
          <div>
            <div className="text-[12px] font-medium">Known policyholder number</div>
            <div className="text-[11px] text-muted-foreground">
              The inbound caller number matched this policyholder record.
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-5 py-4">
        <Field icon={<User className="h-3.5 w-3.5" />} label="Name" value={customer.name} />
        <Field icon={<Calendar className="h-3.5 w-3.5" />} label="Birthdate" value={customer.birthdate} />
        <Field icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={customer.phone} />
        <div>
          <Label icon={<KeyRound className="h-3.5 w-3.5" />}>Roadside PIN</Label>
          <div className="mt-1.5 flex items-center gap-2">
            {customer.pin.split("").map((d, i) => {
              const pos = i + 1;
              const asked = customer.pinDigitsAsked.includes(pos);
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
            Agent asks for digits {customer.pinDigitsAsked.join(" and ")}.
          </p>
        </div>
      </div>

      <Divider label="Policy" />

      <div className="space-y-3 px-5 py-4">
        <Field
          icon={<ShieldAlert className="h-3.5 w-3.5" />}
          label="Tier"
          value={customer.tier}
        />
        <div>
          <Label icon={<Car className="h-3.5 w-3.5" />}>
            Vehicles on policy {customer.vehicles.length > 1 && `(${customer.vehicles.length})`}
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

function UnknownGuide({ phone }: { phone: string }) {
  return (
    <div>
      <div className="px-5 py-4">
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-[color:var(--warning)]" />
          <div>
            <div className="text-[12px] font-medium">Fallback verification</div>
            <div className="text-[11px] text-muted-foreground">
              Unknown number — name, birthdate, and requested PIN digits only.
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 pb-4">
        <Field icon={<Phone className="h-3.5 w-3.5" />} label="Calling from" value={phone || "—"} />
      </div>

      <Divider label="Say you are" />

      <div className="space-y-3 px-5 py-4">
        <Field icon={<User className="h-3.5 w-3.5" />} label="Name" value="Alex Carter" />
        <Field icon={<Calendar className="h-3.5 w-3.5" />} label="Birthdate" value="1988-02-19" />
        <Field icon={<KeyRound className="h-3.5 w-3.5" />} label="PIN challenge" value="Digits 1 and 4: 5 and 2" />
      </div>
    </div>
  );
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
