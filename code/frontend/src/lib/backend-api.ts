import type { Customer, Scenario, Vehicle } from "@/lib/roadside-data";

const BACKEND_BASE =
  import.meta.env.VITE_BACKEND_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8081";

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
  demoLabel: string;
  name: string;
  birthDate: string;
  phoneNumber: string;
  roadsidePin: string;
  homePostcode: string;
  preferredContact: string;
  vehicles: BackendVehicle[];
};

type BackendPolicy = {
  id: string;
  name: string;
  coverageTier: string;
};

type BackendScenario = {
  id: string;
  label: string;
  callerPrompt: string;
  issueType: string;
  locationPrompt: string;
  safetyPrompt: string;
  expectedOutcome: string;
};

export type ClaimSession = {
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
    locationVerifiedByCaller?: boolean | null;
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
      latitude?: number | null;
      longitude?: number | null;
      googleMapsUri?: string | null;
      placeId?: string | null;
      candidateAddresses?: string[];
      source?: string | null;
      requiresCallerConfirmation?: boolean | null;
    } | null;
    providerMatch?: {
      providerName: string;
      actionType: string;
      etaMinutes: number;
      rationale: string;
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
  toolCalls?: Array<{
    toolName: string;
    callId: string;
    status: string;
    argumentsSummary: Record<string, unknown>;
    resultSummary: Record<string, unknown>;
    createdAt: string;
  }>;
};

export type NextStepResponse = {
  allowedAction: string;
  question: string | null;
  reason: string;
  blockedActions: string[];
};

export type AuthVerificationResponse = {
  verified: boolean;
  reason: string;
  authRisk: "STANDARD" | "ELEVATED";
  policyholderName: string | null;
  customerDetails: {
    id: string;
    name: string;
    birthDate: string;
    phoneNumber: string;
    homePostcode: string;
    preferredContact: string;
    vehicles: Array<{
      id: string;
      registration: string;
      make: string;
      model: string;
      year: number;
      colour: string;
      fuelType: string;
      policyId: string;
    }>;
  } | null;
  pinChallengePositions: number[];
  attemptsRemaining: number;
  humanCallbackRequired: boolean;
  cancellationRequired: boolean;
  vehicleOptions: string[];
  nextStep: NextStepResponse;
};

export type BackendDemoData = {
  customers: Customer[];
  scenarios: Scenario[];
};

export async function loadBackendDemoData(): Promise<BackendDemoData> {
  const [customers, policies, scenarios] = await Promise.all([
    getJson<BackendCustomer[]>("/api/customers"),
    getJson<BackendPolicy[]>("/api/policies"),
    getJson<BackendScenario[]>("/api/scenarios"),
  ]);

  const mappedScenarios = scenarios.map(mapScenario);
  return {
    customers: customers.map((customer, index) =>
      mapCustomer(customer, policies, mappedScenarios, index),
    ),
    scenarios: mappedScenarios,
  };
}

export async function createBackendClaim(input: {
  callerPhoneNumber: string;
  scenarioId?: string;
  selectedVehicleId?: string;
  callerIsPolicyholder?: boolean;
}): Promise<ClaimSession> {
  return postJson<ClaimSession>("/api/claims", input);
}

export async function getBackendClaim(claimId: string): Promise<ClaimSession> {
  return getJson<ClaimSession>(`/api/claims/${claimId}`);
}

export async function updateBackendFacts(
  claimId: string,
  input: Record<string, unknown>,
): Promise<ClaimSession> {
  return postJson<ClaimSession>(`/api/claims/${claimId}/facts`, input);
}

export async function appendBackendTranscript(
  claimId: string,
  input: { speaker: "agent" | "caller"; text: string },
): Promise<ClaimSession> {
  return postJson<ClaimSession>(`/api/claims/${claimId}/transcript`, input);
}

export async function appendBackendToolCall(
  claimId: string,
  input: {
    toolName: string;
    callId: string;
    status?: string;
    argumentsSummary?: Record<string, unknown>;
    resultSummary?: Record<string, unknown>;
  },
): Promise<ClaimSession> {
  return postJson<ClaimSession>(`/api/claims/${claimId}/tool-calls`, input);
}

export async function verifyKnownPin(
  claimId: string,
  input: { firstDigit: number; secondDigit: number },
): Promise<AuthVerificationResponse> {
  return postJson<AuthVerificationResponse>(`/api/claims/${claimId}/verify-known-pin`, input);
}

export async function verifyUnknownIdentity(
  claimId: string,
  input: { name: string; birthDate: string; firstDigit: number; secondDigit: number },
): Promise<AuthVerificationResponse> {
  return postJson<AuthVerificationResponse>(
    `/api/claims/${claimId}/verify-unknown-identity`,
    input,
  );
}

export async function getBackendNextStep(claimId: string): Promise<NextStepResponse> {
  return postJson<NextStepResponse>(`/api/claims/${claimId}/next-step`, {});
}

export async function finalizeBackendClaim(claimId: string): Promise<ClaimSession> {
  return postJson<ClaimSession>(`/api/claims/${claimId}/finalize`, {});
}

export async function humanCallbackBackendClaim(
  claimId: string,
  reason: string,
): Promise<ClaimSession> {
  return postJson<ClaimSession>(`/api/claims/${claimId}/human-callback`, { reason });
}

export async function cancelBackendClaim(
  claimId: string,
  reason: string,
): Promise<ClaimSession> {
  return postJson<ClaimSession>(`/api/claims/${claimId}/cancel`, { reason });
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BACKEND_BASE}${path}`);
  if (!response.ok) throw new Error(`Backend GET ${path} failed: ${response.status}`);
  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BACKEND_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Backend POST ${path} failed: ${response.status}`);
  return response.json() as Promise<T>;
}

function mapCustomer(
  customer: BackendCustomer,
  policies: BackendPolicy[],
  scenarios: Scenario[],
  index: number,
): Customer {
  const vehicles = customer.vehicles.map((vehicle) => mapVehicle(vehicle, policies));
  const primaryPolicy = policies.find((policy) => policy.id === customer.vehicles[0]?.policyId);
  const tier = mapTier(primaryPolicy?.coverageTier);
  const suggestedScenarioId = suggestScenarioId(customer, tier, scenarios, index);

  return {
    id: customer.id,
    name: customer.name,
    birthdate: customer.birthDate,
    phone: customer.phoneNumber,
    pin: customer.roadsidePin,
    pinDigitsAsked: pinDigitsFor(customer.roadsidePin, index),
    tier,
    vehicles,
    suggestedScenarioId,
    suggestedLocation:
      scenarios.find((scenario) => scenario.id === suggestedScenarioId)?.locationPhrase ??
      "Location to be captured by voice.",
    suggestedSafety:
      scenarios.find((scenario) => scenario.id === suggestedScenarioId)?.safetyPhrase ??
      "Safety to be captured by voice.",
  };
}

function mapVehicle(vehicle: BackendVehicle, policies: BackendPolicy[]): Vehicle {
  const policy = policies.find((candidate) => candidate.id === vehicle.policyId);
  return {
    id: vehicle.id,
    policyId: vehicle.policyId,
    policyName: policy?.name,
    reg: vehicle.registration,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    fuel: mapFuel(vehicle.fuelType),
  };
}

function mapScenario(scenario: BackendScenario): Scenario {
  const outcome = scenario.expectedOutcome.toLowerCase();
  const safetyExit =
    outcome.includes("safety_escalation") ||
    scenario.issueType.includes("injury") ||
    scenario.issueType.includes("accident_with_injury");
  const human = outcome.includes("human");
  const notCovered = outcome.includes("not_covered") || outcome.includes("not covered");
  const tow = outcome.includes("tow");
  const repair = outcome.includes("repair");

  return {
    id: scenario.id,
    title: scenario.label,
    incidentPhrase: scenario.callerPrompt,
    safetyPhrase: scenario.safetyPrompt,
    locationPhrase: scenario.locationPrompt,
    action: safetyExit ? "Security exit" : human ? "Human review" : tow ? "Tow truck" : repair ? "Repair truck" : "Taxi / rental",
    provider: safetyExit ? "No dispatch" : human ? "Aster Specialist Team" : tow ? "Aster Recovery Network" : "Aster Mobile Technician",
    etaMinutes: safetyExit ? 0 : human ? 15 : tow ? 48 : 35,
    coverage: safetyExit
      ? "Security exit"
      : notCovered
      ? "Not covered"
      : human
        ? "Human review required"
        : outcome.includes("taxi")
          ? "Covered with excess"
          : "Covered",
    customerExplanation: safetyExit
      ? "If anyone may be injured or in immediate danger, call emergency services now. Move to a safe place if you can. We cannot continue roadside intake until everyone is safe."
      : human
      ? "A roadside specialist will call back as soon as one is available."
      : "Aster Roadside has assessed the case and selected the next best assistance step.",
    severity:
      scenario.issueType.includes("injury") || scenario.issueType.includes("third_party")
        ? "high"
        : tow
        ? "medium"
        : "low",
  };
}

function mapFuel(fuelType: string): Vehicle["fuel"] {
  const normalized = fuelType.toLowerCase();
  if (normalized.includes("electric")) return "EV";
  if (normalized.includes("diesel")) return "Diesel";
  if (normalized.includes("hybrid")) return "Hybrid";
  return "Petrol";
}

function mapTier(tier?: string): Customer["tier"] {
  if (tier === "basic") return "Essential";
  if (tier === "premier" || tier === "ev") return "Premier";
  return "Plus";
}

function pinDigitsFor(pin: string, index: number): number[] {
  const pairs = [
    [1, 3],
    [2, 4],
    [1, 4],
    [2, 5],
    [3, 6],
  ];
  return pairs[index % pairs.length].filter((position) => position <= pin.length);
}

function suggestScenarioId(
  customer: BackendCustomer,
  tier: Customer["tier"],
  scenarios: Scenario[],
  index: number,
): string {
  const hasEv = customer.vehicles.some((vehicle) => vehicle.fuelType === "electric");
  const preferred =
    hasEv
      ? "scenario-ev-warning"
      : tier === "Essential"
      ? "scenario-dead-battery"
      : customer.vehicles.length > 1
      ? "scenario-motorway-engine-failure"
      : "scenario-flat-tyre-safe";

  return scenarios.find((scenario) => scenario.id === preferred)?.id ?? scenarios[index % scenarios.length]?.id;
}
