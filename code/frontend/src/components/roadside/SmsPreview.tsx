import type { ReactNode } from "react";
import { AlertOctagon, CheckCircle2, ChevronRight, ExternalLink, MessageSquare } from "lucide-react";
import type { ClaimSession } from "@/lib/backend-api";
import type { Customer, Vehicle } from "@/lib/roadside-data";
import { Button } from "@/components/ui/button";

type Props = {
  customer: Customer | null;
  vehicle: Vehicle | null;
  claim: ClaimSession | null;
  onReset: () => void;
};

export function SmsPreview({
  customer,
  vehicle,
  claim,
  onReset,
}: Props) {
  const cancelled = claim?.status === "NEEDS_HUMAN_CALLBACK" || claim?.status === "NOT_COVERED";
  const reason =
    claim?.coverageDecision?.rationale ??
    claim?.stateEvaluation?.reason ??
    (cancelled ? "The case needs a human callback." : "The case was completed.");
  const smsText =
    claim?.smsPreview ??
    (cancelled
      ? `Aster Roadside: We've asked a roadside specialist to call you back as soon as one is available. Case ref: ${claim?.id ?? "pending"}.`
      : `Aster Roadside: We have your roadside request and will text the next step. Case ref: ${claim?.id ?? "pending"}.`);
  const address =
    claim?.locationResolution?.formattedAddress ??
    claim?.locationResolution?.rawLocation ??
    claim?.intakeFacts.location ??
    "Location not captured";
  const resolvedArea = claim?.locationResolution?.normalizedArea;
  const mapsUri = claim?.locationResolution?.googleMapsUri;
  const backendVehicle =
    customer?.vehicles.find((candidate) => candidate.id === claim?.intakeFacts.selectedVehicleId) ??
    vehicle;
  const vehicleLabel = backendVehicle
    ? `${backendVehicle.year} ${backendVehicle.make} ${backendVehicle.model} · ${backendVehicle.reg}`
    : claim?.intakeFacts.selectedVehicleId ?? "Vehicle to confirm";
  const incidentSummary =
    formatIncident(
      claim?.intakeFacts.incidentSummary ??
        claim?.intakeFacts.issueType ??
        "Incident not captured",
    );
  const safetySummary =
    claim?.intakeFacts.safetySummary ??
    "Safety verbally checked";

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-surface px-8 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {cancelled ? (
              <AlertOctagon className="h-4 w-4 text-destructive" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-[color:var(--success)]" />
            )}
            <h2 className="text-[13px] font-medium tracking-tight">
              {cancelled ? "Cancelled · human callback" : "Resolution summary"}
            </h2>
          </div>
          <Button onClick={onReset} variant="ghost" size="sm" className="gap-1.5">
            New call <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 items-start justify-center overflow-y-auto px-8 py-10">
        <div className="w-full max-w-2xl fade-up">
          <div className="mb-7 rounded-md border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <MessageSquare className="h-4 w-4 text-primary" />
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Simulated SMS
              </div>
            </div>
            <div className="px-4 py-3 text-[13.5px] leading-relaxed">
              {smsText}
            </div>
          </div>

          <div className="grid gap-3">
            <SummaryRow label="Status" value={cancelled ? "Cancelled" : formatStatus(claim?.status)} />
            {cancelled && <SummaryRow label="Why cancelled" value={reason} />}
            <SummaryRow label="Resolved address" value={resolvedArea ? `${address} · ${resolvedArea}` : address} />
            {mapsUri && (
              <SummaryRow
                label="Map"
                value={
                  <a
                    href={mapsUri}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  >
                    Open in Google Maps <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                }
              />
            )}
            <SummaryRow label="Name" value={customer?.name ?? "Unknown caller"} />
            <SummaryRow label="Car" value={vehicleLabel} />
            <SummaryRow label="Incident" value={incidentSummary} />
            <SummaryRow label="Safety" value={safetySummary} />
            {claim?.assistanceAction && (
              <SummaryRow
                label="Backend action"
                value={`${claim.assistanceAction.actionType.replace(/_/g, " ")} · ${claim.assistanceAction.providerName}`}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatStatus(status?: string | null) {
  if (!status) return "Completed";
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatIncident(value: string) {
  const normalized = value.trim();
  if (normalized === "flat_tire") return "Flat tyre";
  if (normalized === "dead_battery") return "Dead battery";
  if (normalized === "engine_failure") return "Engine failure";
  if (normalized === "accident_with_injury") return "Collision with possible injury";
  if (normalized === "third_party_caller") return "Passenger calling for policyholder";
  if (normalized.includes("_")) {
    return normalized
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
  return normalized;
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-4 border-b border-border py-3 last:border-b-0">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-[14px] font-medium leading-relaxed text-foreground">
        {value}
      </div>
    </div>
  );
}
