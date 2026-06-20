import type { ReactNode } from "react";
import { AlertOctagon, CheckCircle2, ChevronRight, ExternalLink, MessageSquare } from "lucide-react";
import type { ClaimSession } from "@/lib/backend-api";
import type { Customer, Vehicle } from "@/lib/roadside-data";
import { Button } from "@/components/ui/button";

const SECURITY_EXIT_MESSAGE =
  "If anyone may be injured or in immediate danger, call emergency services now. Move to a safe place if you can. We cannot continue roadside intake until everyone is safe.";

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
  const status = claim?.workflow.status;
  const humanCallback = status === "NEEDS_HUMAN_CALLBACK";
  const backendCancelled = status === "CANCELLED";
  const notCovered =
    status === "NOT_COVERED" ||
    (status === "COMPLETED" && claim?.artifacts.coverageDecision?.covered === false);
  const reason =
    claim?.artifacts.coverageDecision?.rationale ??
    claim?.workflow.stateEvaluation?.reason ??
    (backendCancelled
      ? "Identity verification failed, so no roadside request was created."
      : humanCallback
        ? "The case needs a human callback."
        : "The case was completed.");
  const securityExit = (humanCallback || backendCancelled) && isSecurityExit(reason);
  const authCancelled = backendCancelled && !securityExit;
  const cancelled = humanCallback || backendCancelled;
  const safetyStop = cancelled && (securityExit || isSafetyStop(reason));
  const smsText =
    notCovered
      ? notCoveredSms(claim, reason)
      : claim?.artifacts.smsPreview ??
        fallbackSms(claim, safetyStop, humanCallback);
  const address =
    claim?.artifacts.locationResolution?.formattedAddress ??
    claim?.artifacts.locationResolution?.rawLocation ??
    claim?.intakeFacts.location ??
    "Location not captured";
  const resolvedArea = claim?.artifacts.locationResolution?.normalizedArea;
  const mapsUri = claim?.artifacts.locationResolution?.googleMapsUri;
  const vehicleConfirmed = claim?.intakeFacts.vehicleConfirmed === true;
  const backendVehicle = vehicleConfirmed
    ? customer?.vehicles.find((candidate) => candidate.id === claim?.intakeFacts.selectedVehicleId) ??
      vehicle
    : null;
  const vehicleLabel = backendVehicle
    ? `${backendVehicle.year} ${backendVehicle.make} ${backendVehicle.model} · ${backendVehicle.reg}`
    : null;
  const incidentSummary =
    formatIncident(
      claim?.intakeFacts.incidentSummary ??
        claim?.intakeFacts.issueType ??
        "Incident not captured",
    );
  const safetySummary =
    claim?.intakeFacts.safetySummary ??
    (cancelled ? "Safety not confirmed" : "Safety not captured");
  const authSummary = formatAuthSummary(claim);

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
              {safetyStop ? "Security exit" : authCancelled ? "Cancelled · verification failed" : cancelled ? "Cancelled · human callback" : "Resolution summary"}
            </h2>
          </div>
          <Button onClick={onReset} variant="ghost" size="sm" className="gap-1.5">
            New call <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 items-start justify-center overflow-y-auto px-8 py-10">
        <div className="w-full max-w-2xl fade-up">
          {smsText ? (
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
          ) : (
            <div className="mb-7 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13.5px] leading-relaxed text-destructive">
              {authCancelled ? "No simulated SMS sent. Identity verification failed, so the roadside request was cancelled." : SECURITY_EXIT_MESSAGE}
            </div>
          )}

          <div className="grid gap-3">
            <SummaryRow label="Status" value={safetyStop ? "Security exit" : cancelled ? "Cancelled" : "Completed"} />
            {cancelled && <SummaryRow label={safetyStop ? "Why stopped" : "Why cancelled"} value={reason} />}
            {!cancelled && notCovered && <SummaryRow label="Dispatch decision" value="No dispatch" />}
            {!cancelled && notCovered && <SummaryRow label="Reason" value={reason} />}
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
            <SummaryRow label="Authentication" value={authSummary} />
            {vehicleLabel && <SummaryRow label="Car" value={vehicleLabel} />}
            <SummaryRow label="Incident" value={incidentSummary} />
            <SummaryRow label="Safety" value={safetySummary} />
            {claim?.artifacts.assistanceAction && (
              <SummaryRow
                label="Backend action"
                value={`${claim.artifacts.assistanceAction.actionType.replace(/_/g, " ")} · ${claim.artifacts.assistanceAction.providerName}`}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function isSafetyStop(reason: string) {
  const normalized = reason.toLowerCase();
  return (
    normalized.includes("safe place") ||
    normalized.includes("not safe") ||
    normalized.includes("unsafe") ||
    normalized.includes("move to safety") ||
    normalized.includes("away from traffic") ||
    normalized.includes("middle of the road") ||
    normalized.includes("in traffic")
  );
}

function isSecurityExit(reason: string) {
  const normalized = reason.toLowerCase();
  return (
    isSafetyStop(reason) ||
    normalized.includes("security exit") ||
    normalized.includes("immediate safety") ||
    normalized.includes("immediate danger") ||
    normalized.includes("emergency services") ||
    normalized.includes("injury") ||
    normalized.includes("injured") ||
    normalized.includes("hurt") ||
    normalized.includes("smoke") ||
    normalized.includes("fire") ||
    normalized.includes("flood") ||
    normalized.includes("ev battery") ||
    normalized.includes("high-voltage")
  );
}

function formatAuthSummary(claim: ClaimSession | null) {
  if (!claim) return "Not available";
  if (!claim.intakeFacts.identityConfirmed) {
    return claim.authentication.authMode === "FALLBACK_SIMULATED"
      ? "Unknown number; full verification failed or was not completed"
      : "Known policyholder number; PIN verification failed or was not completed";
  }
  if (claim.authentication.authMode === "FALLBACK_SIMULATED") {
    return "Unknown number; verified with full name, birthdate, and requested PIN digits";
  }
  return "Known policyholder number; verified with requested PIN digits";
}

function notCoveredSms(
  claim: ClaimSession | null,
  reason: string,
) {
  const customerReason = reason
    .replace(" in the prototype policy data", "")
    .replace("does not automatically cover", "does not cover")
    .replace(/\.$/, "");
  return `Aster Roadside: We assessed your roadside request, but it is not covered by your policy. ${customerReason}. No truck has been dispatched. Case ref: ${claim?.identity.id ?? "pending"}.`;
}

function fallbackSms(
  claim: ClaimSession | null,
  safetyStop: boolean,
  humanCallback: boolean,
) {
  if (safetyStop) return null;
  if (humanCallback) {
    return `Aster Roadside: We've asked a roadside specialist to call you back as soon as one is available. Case ref: ${claim?.identity.id ?? "pending"}.`;
  }
  return `Aster Roadside: We have your roadside request and will text the next step. Case ref: ${claim?.identity.id ?? "pending"}.`;
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
