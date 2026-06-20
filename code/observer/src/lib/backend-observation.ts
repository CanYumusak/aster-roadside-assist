import { useEffect, useMemo, useState } from "react";
import { CASES } from "@/lib/observation-data";
import type {
  AttentionFlag,
  AuthMethod,
  CaseStatus,
  GateStatus,
  ObservedCase,
  SystemEvent,
  TranscriptTurn,
} from "@/lib/observation-data";

const BACKEND_BASE =
  import.meta.env.VITE_BACKEND_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8081";
const REFRESH_MS = 1_500;
const SECURITY_EXIT_MESSAGE =
  "If anyone may be injured or in immediate danger, call emergency services now. Move to a safe place if you can. We cannot continue roadside intake until everyone is safe.";

type BackendVehicle = {
  id: string;
  registration: string;
  make: string;
  model: string;
  year: number;
  colour: string;
  fuelType: string;
  policyId: string;
};

type BackendCustomer = {
  id: string;
  name: string;
  birthDate: string;
  phoneNumber: string;
  vehicles: BackendVehicle[];
};

type BackendPolicy = {
  id: string;
  name: string;
};

type ClaimSession = {
  identity: {
    id: string;
    callerPhoneNumber: string;
    customerId: string | null;
    scenarioId: string | null;
  };
  authentication: {
    authMode: "KNOWN_NUMBER_SIMULATED" | "FALLBACK_SIMULATED";
    authRisk: "STANDARD" | "ELEVATED";
    pinChallengePositions: number[];
    pinVerificationAttempts: number;
  };
  intakeFacts: {
    identityConfirmed: boolean;
    vehicleConfirmed: boolean;
    locationConfirmed: boolean;
    safetyKnown: boolean;
    incidentKnown: boolean;
    callerIsPolicyholder: boolean | null;
    selectedVehicleId: string | null;
    location: string | null;
    issueType: string | null;
    incidentSummary: string | null;
    safetySummary: string | null;
  };
  workflow: {
    status: "CREATED" | "IN_PROGRESS" | "NEEDS_HUMAN_CALLBACK" | "CANCELLED" | "NOT_COVERED" | "COMPLETED";
    stage: string;
    missingFacts: string[];
    blockedActions: string[];
    stateEvaluation?: {
      allowedAction: string;
      question?: string | null;
      reason: string;
    } | null;
  };
  artifacts: {
    locationResolution?: {
      rawLocation: string;
      normalizedArea: string;
      dispatchable: boolean;
      confidence: number;
      rationale: string;
      formattedAddress?: string | null;
      googleMapsUri?: string | null;
      source?: string | null;
      requiresCallerConfirmation?: boolean | null;
    } | null;
    coverageDecision?: {
      covered: boolean;
      confidence: number;
      rationale: string;
      escalationRequired: boolean;
    } | null;
    assistanceAction?: {
      actionType: string;
      providerName: string;
      etaMinutes: number;
      customerMessage: string;
    } | null;
    smsPreview?: string | null;
  };
  transcript?: Array<{
    speaker: "agent" | "caller" | string;
    text: string;
    createdAt: string;
  }>;
  auditEvents?: Array<{
    type: string;
    status: string;
    label: string;
    createdAt: string;
  }>;
  toolCalls?: Array<{
    toolName: string;
    callId: string;
    status: string;
    argumentsSummary: Record<string, unknown>;
    resultSummary: Record<string, unknown>;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

type ObservationState = {
  cases: ObservedCase[];
  usingFallbackData: boolean;
  loading: boolean;
  error: string | null;
  refreshedAt: Date | null;
};

export function useObservedCases(): ObservationState {
  const [claims, setClaims] = useState<ClaimSession[]>([]);
  const [customers, setCustomers] = useState<BackendCustomer[]>([]);
  const [policies, setPolicies] = useState<BackendPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const [nextClaims, nextCustomers, nextPolicies] = await Promise.all([
          getJson<ClaimSession[]>("/api/claims"),
          getJson<BackendCustomer[]>("/api/customers"),
          getJson<BackendPolicy[]>("/api/policies"),
        ]);
        if (cancelled) return;
        setClaims(nextClaims);
        setCustomers(nextCustomers);
        setPolicies(nextPolicies);
        setError(null);
        setRefreshedAt(new Date());
      } catch (refreshError) {
        if (cancelled) return;
        setError(refreshError instanceof Error ? refreshError.message : "Could not load cases.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const usingFallbackData = claims.length === 0;
  const cases = useMemo(() => {
    const backendCases = claims.map((claim) => mapObservedCase(claim, customers, policies));
    const backendRefs = new Set(backendCases.map((claim) => claim.caseRef));
    const seedCases = CASES.filter((claim) => !backendRefs.has(claim.caseRef));
    return [...backendCases, ...seedCases];
  }, [claims, customers, policies]);

  return { cases, usingFallbackData, loading, error, refreshedAt };
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BACKEND_BASE}${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Backend GET ${path} failed: ${response.status}`);
  return response.json() as Promise<T>;
}

function mapObservedCase(
  claim: ClaimSession,
  customers: BackendCustomer[],
  policies: BackendPolicy[],
): ObservedCase {
  const customer = customers.find((candidate) => candidate.id === claim.identity.customerId);
  const vehicle = customer?.vehicles.find(
    (candidate) => candidate.id === claim.intakeFacts.selectedVehicleId,
  );
  const policy = policies.find((candidate) => candidate.id === vehicle?.policyId);
  const safetyStop = isSafetyStop(claim);
  const status = statusFor(claim, safetyStop);
  const authMethod = authMethodFor(claim);
  const flags = attentionFlagsFor(claim, safetyStop);
  const identityKnown = claim.intakeFacts.identityConfirmed && Boolean(customer);
  const vehicleConfirmed = claim.intakeFacts.vehicleConfirmed && Boolean(vehicle);
  const locationDispatchable =
    claim.artifacts.locationResolution?.dispatchable === true && claim.intakeFacts.locationConfirmed;
  const incidentClassified = claim.intakeFacts.incidentKnown;
  const coverageAllowed = claim.workflow.stateEvaluation?.allowedAction === "coverage_decision";
  const callerLabel = identityKnown ? customer?.name ?? "Verified caller" : "Unknown caller";

  return {
    caseRef: claim.identity.id,
    status,
    stage: claim.workflow.stage,
    updatedAt: claim.updatedAt,
    coverageOutcome: coverageOutcomeFor(claim),
    authMethod,
    attentionFlags: flags,
    callerPhone: formatPhone(claim.identity.callerPhoneNumber),
    callerLabel,
    policyholderName: identityKnown ? customer?.name : undefined,
    vehicleLabel: vehicleConfirmed && vehicle ? vehicleLabel(vehicle) : undefined,
    vehicleConfirmed,
    incident: incidentClassified
      ? formatIncident(claim.intakeFacts.incidentSummary ?? claim.intakeFacts.issueType)
      : claim.intakeFacts.incidentSummary ?? undefined,
    location:
      claim.artifacts.locationResolution?.formattedAddress ??
      claim.artifacts.locationResolution?.rawLocation ??
      claim.intakeFacts.location ??
      undefined,
    locationDispatchable,
    incidentClassified,
    outcomeReason: outcomeReasonFor(claim, safetyStop),
    finalAgentMessage: safetyStop
      ? SECURITY_EXIT_MESSAGE
      : undefined,
    smsPreview: smsPreviewFor(claim, safetyStop),
    elapsed: elapsedSince(claim.createdAt),
    lastUpdate: relativeTime(claim.updatedAt),
    pinAttempts: `${claim.authentication.pinVerificationAttempts} / 3`,
    gates: {
      safetyChecked: safetyGateFor(claim, safetyStop),
      identityVerified: identityGateFor(claim, safetyStop),
      vehicleConfirmed: gateFor(vehicleConfirmed, claim.intakeFacts.identityConfirmed),
      locationDispatchable: gateFor(locationDispatchable, vehicleConfirmed),
      incidentClassified: gateFor(incidentClassified, locationDispatchable),
      coverageReviewAllowed:
        claim.workflow.status === "COMPLETED" || claim.workflow.status === "NOT_COVERED" || coverageAllowed
          ? "ok"
          : safetyStop || claim.workflow.status === "NEEDS_HUMAN_CALLBACK" || claim.workflow.status === "CANCELLED" || claim.workflow.status === "NOT_COVERED"
            ? "blocked"
            : "pending",
      smsGenerated: claim.artifacts.smsPreview
        ? "ok"
        : safetyStop || claim.workflow.status === "CANCELLED"
          ? "skipped"
          : claim.workflow.status === "COMPLETED" || claim.workflow.status === "NOT_COVERED" || claim.workflow.status === "NEEDS_HUMAN_CALLBACK"
            ? "pending"
            : "not_reached",
    },
    coverage: coverageFor(claim, policy, safetyStop),
    nextAction: nextActionFor(claim, safetyStop),
    transcript: transcriptFor(claim, customer, vehicle),
    events: eventsFor(claim, safetyStop),
  };
}

function statusFor(claim: ClaimSession, safetyStop: boolean): CaseStatus {
  if (claim.workflow.status === "CREATED") return "created";
  if (claim.workflow.status === "IN_PROGRESS") return "in_progress";
  if (claim.workflow.status === "CANCELLED") return "cancelled";
  if (claim.workflow.status === "NEEDS_HUMAN_CALLBACK") return "needs_human_callback";
  if (claim.workflow.status === "NOT_COVERED") return "not_covered";
  return "completed";
}

function coverageOutcomeFor(claim: ClaimSession): ObservedCase["coverageOutcome"] {
  if (claim.workflow.status === "NOT_COVERED") return "not_covered";
  if (claim.workflow.status !== "COMPLETED") return undefined;
  return claim.artifacts.coverageDecision?.covered === false ? "not_covered" : "covered";
}

function authMethodFor(claim: ClaimSession): AuthMethod {
  if (claim.intakeFacts.callerIsPolicyholder === false) return "not_policyholder";
  if (claim.authentication.authMode === "FALLBACK_SIMULATED") return "full_verification";
  if (!claim.identity.customerId) return "unverified";
  return "phone_match_pin";
}

function attentionFlagsFor(claim: ClaimSession, safetyStop: boolean): AttentionFlag[] {
  const flags = new Set<AttentionFlag>();
  if (safetyStop) {
    flags.add("unsafe");
    flags.add("no SMS");
  }
  if (claim.authentication.authMode === "FALLBACK_SIMULATED") flags.add("unknown number");
  if (claim.authentication.pinVerificationAttempts > 0) flags.add("auth retry");
  if (!safetyStop && (claim.workflow.status === "CANCELLED" || (claim.workflow.status === "NEEDS_HUMAN_CALLBACK" && outcomeReasonFor(claim, safetyStop).toLowerCase().includes("pin")))) {
    flags.add("auth failed");
    flags.add("no SMS");
  }
  if (claim.intakeFacts.callerIsPolicyholder === false) flags.add("not policyholder");
  if (claim.workflow.missingFacts.some((fact) => fact.includes("location"))) flags.add("location unclear");
  if (claim.workflow.missingFacts.includes("incident")) flags.add("incident unclear");
  return Array.from(flags);
}

function isSafetyStop(claim: ClaimSession) {
  const text = outcomeReasonFor(claim, false).toLowerCase();
  return (
    (claim.workflow.status === "CANCELLED" || claim.workflow.status === "NEEDS_HUMAN_CALLBACK") &&
    !claim.artifacts.smsPreview &&
    (text.includes("safe place") ||
      text.includes("not safe") ||
      text.includes("unsafe") ||
      text.includes("move to safety") ||
      text.includes("away from traffic") ||
      text.includes("middle of the road") ||
      text.includes("in traffic") ||
      text.includes("security exit") ||
      text.includes("immediate safety") ||
      text.includes("immediate danger") ||
      text.includes("emergency services") ||
      text.includes("injury") ||
      text.includes("injured"))
  );
}

function outcomeReasonFor(claim: ClaimSession, safetyStop: boolean) {
  if (safetyStop) {
    return claim.artifacts.coverageDecision?.rationale ?? "Security exit: automated intake stopped until everyone is safe.";
  }
  return (
    claim.artifacts.coverageDecision?.rationale ??
    claim.workflow.stateEvaluation?.reason ??
    (claim.workflow.status === "CANCELLED" ? "Identity verification failed; request cancelled without SMS." : claim.workflow.status === "COMPLETED" ? "Case completed." : "Case in progress.")
  );
}

function safetyGateFor(claim: ClaimSession, safetyStop: boolean): GateStatus {
  if (safetyStop) return "blocked";
  if (claim.intakeFacts.safetyKnown) return "ok";
  return "pending";
}

function identityGateFor(claim: ClaimSession, safetyStop: boolean): GateStatus {
  if (safetyStop) return "not_reached";
  if (claim.intakeFacts.identityConfirmed) return "ok";
  if ((claim.workflow.status === "NEEDS_HUMAN_CALLBACK" || claim.workflow.status === "CANCELLED") && claim.authentication.pinVerificationAttempts >= 3) return "blocked";
  return claim.intakeFacts.safetyKnown ? "pending" : "not_reached";
}

function gateFor(done: boolean, priorDone: boolean): GateStatus {
  if (done) return "ok";
  return priorDone ? "pending" : "not_reached";
}

function coverageFor(
  claim: ClaimSession,
  policy: BackendPolicy | undefined,
  safetyStop: boolean,
): ObservedCase["coverage"] {
  if (safetyStop) {
    return { evaluated: false, reason: "Security exit before intake" };
  }
  if (!claim.artifacts.coverageDecision) {
    return {
      evaluated: false,
      reason: claim.workflow.stateEvaluation?.reason ?? "Awaiting required intake facts",
    };
  }
  return {
    evaluated: true,
    policy: policy?.name ?? "Synthetic policy",
    reason: claim.artifacts.coverageDecision.rationale,
    rules: [
      { label: "Identity verified", result: claim.intakeFacts.identityConfirmed ? "pass" : "fail" },
      { label: "Vehicle confirmed", result: claim.intakeFacts.vehicleConfirmed ? "pass" : "fail" },
      { label: "Dispatchable location", result: claim.artifacts.locationResolution?.dispatchable ? "pass" : "fail" },
      { label: "Incident classified", result: claim.intakeFacts.incidentKnown ? "pass" : "fail" },
    ],
  };
}

function nextActionFor(claim: ClaimSession, safetyStop: boolean): ObservedCase["nextAction"] {
  if (safetyStop) {
    return { evaluated: false, reason: SECURITY_EXIT_MESSAGE };
  }
  if (claim.workflow.status === "CANCELLED") {
    return {
      evaluated: false,
      reason: claim.artifacts.coverageDecision?.rationale ?? "Identity verification failed; no dispatch decision.",
    };
  }
  if (claim.workflow.status === "NEEDS_HUMAN_CALLBACK") {
    return {
      evaluated: false,
      reason: claim.artifacts.coverageDecision?.rationale ?? "Roadside specialist callback required.",
    };
  }
  if (claim.artifacts.coverageDecision && !claim.artifacts.coverageDecision.covered) {
    return {
      evaluated: false,
      reason: claim.artifacts.coverageDecision.rationale,
    };
  }
  if (!claim.artifacts.assistanceAction) {
    return { evaluated: false, reason: claim.workflow.stateEvaluation?.reason ?? "Awaiting outcome." };
  }
  return {
    evaluated: true,
    actionType: claim.artifacts.assistanceAction.actionType.replace(/_/g, " "),
    provider: claim.artifacts.assistanceAction.providerName,
    eta: `${claim.artifacts.assistanceAction.etaMinutes} min`,
    reason: claim.artifacts.assistanceAction.customerMessage,
  };
}

function transcriptFor(
  claim: ClaimSession,
  customer: BackendCustomer | undefined,
  vehicle: BackendVehicle | undefined,
): TranscriptTurn[] {
  if (claim.transcript?.length) {
    return claim.transcript.map((turn) => ({
      speaker: turn.speaker === "caller" ? "caller" : "agent",
      text: turn.text,
      time: clock(turn.createdAt),
    }));
  }

  const turns: TranscriptTurn[] = [
    {
      speaker: "agent",
      text: "Aster Roadside, is everyone safe and away from traffic or immediate danger?",
      time: clock(claim.createdAt),
    },
  ];
  if (claim.intakeFacts.safetySummary) {
    turns.push({ speaker: "caller", text: claim.intakeFacts.safetySummary, time: clock(claim.updatedAt) });
  }
  if (claim.intakeFacts.identityConfirmed && customer) {
    turns.push({ speaker: "agent", text: "Identity verified by backend.", time: clock(claim.updatedAt) });
  }
  if (claim.intakeFacts.vehicleConfirmed && vehicle) {
    turns.push({ speaker: "caller", text: vehicleLabel(vehicle), time: clock(claim.updatedAt) });
  }
  if (claim.intakeFacts.location) {
    turns.push({ speaker: "caller", text: claim.intakeFacts.location, time: clock(claim.updatedAt) });
  }
  if (claim.intakeFacts.incidentSummary) {
    turns.push({ speaker: "caller", text: claim.intakeFacts.incidentSummary, time: clock(claim.updatedAt) });
  }
  if (isSafetyStop(claim)) {
    turns.push({
      speaker: "agent",
      text: SECURITY_EXIT_MESSAGE,
      time: clock(claim.updatedAt),
    });
  }
  return turns;
}

function eventsFor(claim: ClaimSession, safetyStop: boolean): SystemEvent[] {
  if (claim.auditEvents?.length) {
    return [
      ...claim.auditEvents.map((event) => ({
        type: event.type,
        status: eventStatus(event.status),
        label: event.label,
        time: clock(event.createdAt),
      })),
      ...toolCallEvents(claim),
    ].sort((left, right) => left.time.localeCompare(right.time));
  }

  const events: SystemEvent[] = [
    { type: "case.created", status: "info", label: "Case created", time: clock(claim.createdAt) },
  ];
  if (claim.intakeFacts.identityConfirmed) {
    events.push({ type: "auth.updated", status: "ok", label: "Identity verified", time: clock(claim.updatedAt) });
  }
  if (claim.authentication.pinVerificationAttempts > 0) {
    events.push({ type: "auth.retry", status: "warn", label: `${claim.authentication.pinVerificationAttempts} PIN attempt(s)`, time: clock(claim.updatedAt) });
  }
  if (claim.intakeFacts.vehicleConfirmed) {
    events.push({ type: "fact.vehicle", status: "ok", label: "Vehicle confirmed", time: clock(claim.updatedAt) });
  }
  if (claim.artifacts.locationResolution) {
    events.push({
      type: "location.resolved",
      status: claim.artifacts.locationResolution.dispatchable ? "ok" : "blocked",
      label: claim.artifacts.locationResolution.rationale,
      time: clock(claim.updatedAt),
    });
  }
  if (claim.intakeFacts.incidentKnown) {
    events.push({ type: "incident.classified", status: "ok", label: "Incident classified", time: clock(claim.updatedAt) });
  }
  if (claim.artifacts.coverageDecision) {
    events.push({
      type: "coverage.decided",
      status: claim.artifacts.coverageDecision.covered ? "ok" : "blocked",
      label: claim.artifacts.coverageDecision.rationale,
      time: clock(claim.updatedAt),
    });
  }
  if (claim.artifacts.smsPreview) {
    events.push({ type: "sms.generated", status: "ok", label: "Customer SMS generated", time: clock(claim.updatedAt) });
  }
  if (safetyStop) {
    events.push({ type: "sms.skipped", status: "skipped", label: "SMS skipped for security exit", time: clock(claim.updatedAt) });
  }
  return [...events, ...toolCallEvents(claim)].sort((left, right) => left.time.localeCompare(right.time));
}

function toolCallEvents(claim: ClaimSession): SystemEvent[] {
  return claim.toolCalls?.map((toolCall) => ({
    type: `tool.${toolCall.toolName}`,
    status: eventStatus(toolCall.status),
    label: toolCallLabel(toolCall),
    time: clock(toolCall.createdAt),
  })) ?? [];
}

function toolCallLabel(toolCall: NonNullable<ClaimSession["toolCalls"]>[number]) {
  const result = toolCall.resultSummary;
  const action =
    result.nextAction ??
    result.allowedAction ??
    result.disposition ??
    result.verified ??
    result.ended;
  return action === undefined
    ? `Tool completed (${toolCall.callId})`
    : `Tool completed: ${String(action)}`;
}

function eventStatus(value: string): SystemEvent["status"] {
  if (value === "ok" || value === "blocked" || value === "skipped" || value === "info" || value === "warn") {
    return value;
  }
  return "info";
}

function vehicleLabel(vehicle: BackendVehicle) {
  return `${vehicle.year} ${vehicle.make} ${vehicle.model} · ${vehicle.registration}`;
}

function formatIncident(value?: string | null) {
  if (!value) return undefined;
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function smsPreviewFor(claim: ClaimSession, safetyStop: boolean) {
  if (safetyStop) return null;
  if (claim.workflow.status === "CANCELLED") return null;
  if (claim.workflow.status === "NOT_COVERED" || (claim.workflow.status === "COMPLETED" && claim.artifacts.coverageDecision?.covered === false)) {
    const reason =
      claim.artifacts.coverageDecision?.rationale ??
      "The reported incident is not automatically covered by the selected policy.";
    const customerReason = reason
      .replace(" in the prototype policy data", "")
      .replace("does not automatically cover", "does not cover")
      .replace(/\.$/, "");
    return `Aster Roadside: We assessed your roadside request, but it is not covered by your policy. ${customerReason}. No truck has been dispatched. Case ref: ${claim.identity.id}.`;
  }
  if (claim.artifacts.smsPreview) return claim.artifacts.smsPreview;
  if (claim.workflow.status === "NEEDS_HUMAN_CALLBACK") {
    return `Aster Roadside: Your case has been sent to a roadside specialist. They will call you back as soon as one is available. Case ref: ${claim.identity.id}. If you are in immediate danger, call emergency services.`;
  }
  return null;
}

function formatPhone(value: string) {
  return value.replace(/^\+44(\d{4})(\d{6})$/, "+44 $1 $2");
}

function elapsedSince(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")}`;
}

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 3) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function clock(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}
