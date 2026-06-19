import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CUSTOMERS,
  SCENARIOS,
  STAGES,
  UNKNOWN_DEMO_PHONE,
  type CallState,
  type Customer,
  type Scenario,
  type Stage,
} from "@/lib/roadside-data";
import {
  createBackendClaim,
  finalizeBackendClaim,
  humanCallbackBackendClaim,
  loadBackendDemoData,
  updateBackendFacts,
  type ClaimSession,
} from "@/lib/backend-api";
import { DemoGuide } from "@/components/roadside/DemoGuide";
import { CallSurface, type VoiceConnectionStatus } from "@/components/roadside/CallSurface";
import { SmsPreview } from "@/components/roadside/SmsPreview";
import { Button } from "@/components/ui/button";
import { Phone, ShieldCheck, ChevronDown } from "lucide-react";
import {
  startRealtimeVoiceSession,
  type RealtimeVoiceDoneDisposition,
  type RealtimeVoiceSession,
} from "@/lib/realtime-voice";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aster Roadside — Voice Agent" },
      {
        name: "description",
        content:
          "Internal simulator for the Aster Roadside AI voice agent. Run a fake inbound call, walk the intake stages, and review the operator trace.",
      },
      { property: "og:title", content: "Aster Roadside — Voice Agent" },
      { property: "og:description", content: "Internal voice agent simulator." },
    ],
  }),
  component: AsterApp,
});

type Screen = "start" | "call" | "sms";
type BackendStatus = "connecting" | "connected" | "fallback";

function AsterApp() {
  const [screen, setScreen] = useState<Screen>("start");
  const [customers, setCustomers] = useState<Customer[]>(CUSTOMERS);
  const [scenarios, setScenarios] = useState<Scenario[]>(SCENARIOS);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("connecting");
  const [backendClaim, setBackendClaim] = useState<ClaimSession | null>(null);
  const [phone, setPhone] = useState("");
  const [callState, setCallState] = useState<CallState>("Ready");
  const [callDisposition, setCallDisposition] =
    useState<RealtimeVoiceDoneDisposition | null>(null);
  const [stageIndex, setStageIndex] = useState(-1);
  const [selectedVehicleIndex, setSelectedVehicleIndex] = useState(0);
  const [selectedScenarioId, setSelectedScenarioId] = useState(SCENARIOS[0].id);
  const [voiceStatus, setVoiceStatus] = useState<VoiceConnectionStatus>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const realtimeSessionRef = useRef<RealtimeVoiceSession | null>(null);

  const customer: Customer | null = useMemo(() => {
    const normalized = phone.replace(/\s+/g, "");
    return customers.find((c) => c.phone.replace(/\s+/g, "") === normalized) ?? null;
  }, [customers, phone]);

  const authRisk: "standard" | "elevated" = customer ? "standard" : "elevated";

  const scenario = useMemo(
    () => scenarios.find((s) => s.id === selectedScenarioId) ?? scenarios[0] ?? SCENARIOS[0],
    [scenarios, selectedScenarioId],
  );

  const fallbackCaseRef = useMemo(() => {
    const ts = Date.now().toString(36).toUpperCase().slice(-5);
    return `RA-${ts}-${(customer?.id ?? "GST").toUpperCase()}`;
  }, [customer]);
  const caseRef = backendClaim?.id ?? fallbackCaseRef;

  const selectedVehicle = customer?.vehicles[selectedVehicleIndex] ?? null;
  const resolvedCustomer =
    (backendClaim?.customerId
      ? customers.find((candidate) => candidate.id === backendClaim.customerId)
      : null) ?? customer;
  const resolvedVehicle =
    resolvedCustomer?.vehicles.find(
      (candidate) => candidate.id === backendClaim?.intakeFacts.selectedVehicleId,
    ) ??
    (resolvedCustomer?.id === customer?.id ? selectedVehicle : null) ??
    resolvedCustomer?.vehicles[0] ??
    selectedVehicle;

  useEffect(() => {
    let cancelled = false;
    loadBackendDemoData()
      .then((data) => {
        if (cancelled) return;
        setCustomers(data.customers);
        setScenarios(data.scenarios);
        setSelectedScenarioId(data.scenarios[0]?.id ?? SCENARIOS[0].id);
        setBackendStatus("connected");
      })
      .catch(() => {
        if (cancelled) return;
        setBackendStatus("fallback");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      realtimeSessionRef.current?.close();
      realtimeSessionRef.current = null;
    };
  }, []);

  function handleSelectPhone(value: string) {
    setPhone(value);
    const c = customers.find((x) => x.phone === value);
    if (c) {
      setSelectedScenarioId(c.suggestedScenarioId);
      setSelectedVehicleIndex(0);
    }
  }

  async function handleStart() {
    if (!phone) return;
    realtimeSessionRef.current?.close();
    realtimeSessionRef.current = null;
    setScreen("call");
    setCallState("Ringing");
    setStageIndex(0);
    setVoiceStatus("connecting");
    setVoiceError(null);
    setCallDisposition(null);
    let claimForSession: ClaimSession | null = null;

    try {
      const claim = await createBackendClaim({
        callerPhoneNumber: phone,
        scenarioId: scenario.id,
        selectedVehicleId: selectedVehicle?.id,
        callerIsPolicyholder: true,
      });
      claimForSession = claim;
      setBackendClaim(claim);
      setBackendStatus("connected");
    } catch {
      setBackendClaim(null);
      setBackendStatus("fallback");
    }

    try {
      realtimeSessionRef.current = await startRealtimeVoiceSession({
        callerPhone: phone,
        customer,
        selectedVehicle,
        scenario,
        caseRef: claimForSession?.id ?? caseRef,
        authRisk,
      }, {
        onDone: (disposition) => {
          void finishCallFromAgent(disposition, claimForSession?.id);
        },
      });
      setVoiceStatus("connected");
      setCallState("Speaking");
    } catch (error) {
      setVoiceStatus("error");
      setVoiceError(error instanceof Error ? error.message : "Voice connection failed.");
      setCallState("Ready");
    }
  }

  function handleNext() {
    const next = Math.min(stageIndex + 1, STAGES.length - 1);
    void syncBackendStage(STAGES[next]);

    if (next === STAGES.length - 1) {
      const escalated = scenario.coverage === "Human review required";
      setCallDisposition(escalated ? "human_callback" : "complete");
      setCallState(escalated ? "Escalated" : "Completed");
      setTimeout(() => setScreen("sms"), 500);
    } else {
      setCallState((s) =>
        s === "Listening" ? "Thinking" : s === "Thinking" ? "Speaking" : "Listening",
      );
    }

    setStageIndex(next);
  }

  async function syncBackendStage(stage: Stage) {
    if (!backendClaim) return;

    try {
      if (stage === "SMS") {
        setBackendClaim(await finalizeBackendClaim(backendClaim.id));
        return;
      }

      const updated = await updateBackendFacts(backendClaim.id, factsForStage(stage));
      setBackendClaim(updated);
      setBackendStatus("connected");
    } catch {
      setBackendStatus("fallback");
    }
  }

  async function handleEnd() {
    realtimeSessionRef.current?.close();
    realtimeSessionRef.current = null;
    if (backendClaim) {
      try {
        setBackendClaim(await finalizeBackendClaim(backendClaim.id));
        setBackendStatus("connected");
      } catch {
        setBackendStatus("fallback");
      }
    }
    setVoiceStatus("idle");
    setCallDisposition(scenario.coverage === "Human review required" ? "human_callback" : "complete");
    setCallState("Completed");
    setScreen("sms");
    setStageIndex(STAGES.length - 1);
  }

  async function finishCallFromAgent(
    disposition: RealtimeVoiceDoneDisposition,
    claimId?: string,
  ) {
    realtimeSessionRef.current = null;
    if (claimId) {
      try {
        setBackendClaim(
          disposition === "human_callback"
            ? await humanCallbackBackendClaim(
                claimId,
                "AI agent routed the case to a human callback.",
              )
            : await finalizeBackendClaim(claimId),
        );
        setBackendStatus("connected");
      } catch {
        setBackendStatus("fallback");
      }
    }
    setVoiceStatus("idle");
    setCallDisposition(disposition);
    setCallState(disposition === "human_callback" ? "Escalated" : "Completed");
    setScreen("sms");
    setStageIndex(STAGES.length - 1);
  }

  function reset() {
    realtimeSessionRef.current?.close();
    realtimeSessionRef.current = null;
    setVoiceStatus("idle");
    setVoiceError(null);
    setScreen("start");
    setCallDisposition(null);
    setCallState("Ready");
    setStageIndex(-1);
    setBackendClaim(null);
  }

  const currentStage = stageIndex >= 0 ? STAGES[stageIndex] : null;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar
        screen={screen}
      />

      <div className="grid flex-1 grid-cols-[1fr_360px] overflow-hidden">
        <main className="flex h-full flex-col overflow-hidden">
          {screen === "start" && (
            <StartScreen
              phone={phone}
              setPhone={setPhone}
              onPick={handleSelectPhone}
              onStart={handleStart}
              customers={customers}
              backendStatus={backendStatus}
            />
          )}
          {screen === "call" && (
            <CallSurface
              callState={callState}
              stageIndex={stageIndex}
              onStart={handleStart}
              onEnd={handleEnd}
              onNext={handleNext}
              customerName={customer?.name ?? "Unknown caller"}
              callerPhone={phone}
              authRisk={authRisk}
              voiceStatus={voiceStatus}
              voiceError={voiceError}
            />
          )}
          {screen === "sms" && (
            <SmsPreview
              customer={resolvedCustomer}
              vehicle={resolvedVehicle}
              claim={backendClaim}
              onReset={reset}
            />
          )}
        </main>

        <DemoGuide
          phone={phone}
          customer={customer}
          selectedVehicleIndex={selectedVehicleIndex}
          setSelectedVehicleIndex={setSelectedVehicleIndex}
          selectedScenarioId={selectedScenarioId}
          setSelectedScenarioId={setSelectedScenarioId}
          currentStage={currentStage}
        />
      </div>
    </div>
  );

  function factsForStage(stage: Stage): Record<string, unknown> {
    switch (stage) {
      case "Verify":
        return {};
      case "Safety":
        return {
          safetyKnown: true,
          safetySummary: scenario.safetyPhrase,
        };
      case "Location":
        return {
          locationConfirmed: true,
          location: scenario.locationPhrase,
        };
      case "Vehicle":
        return {
          vehicleConfirmed: true,
          selectedVehicleId: selectedVehicle?.id,
        };
      case "Incident":
        return {
          incidentKnown: true,
          incidentSummary: scenario.incidentPhrase,
        };
      case "Coverage":
      case "Action":
        return {};
      default:
        return {};
    }
  }
}

function TopBar({
  screen,
}: {
  screen: Screen;
}) {
  return (
    <header className="flex items-center justify-between border-b border-border bg-background px-6 py-2.5">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
            <ShieldCheck className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold tracking-tight">Aster Roadside</div>
            <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Voice agent · simulator
            </div>
          </div>
        </div>
        <nav className="flex items-center gap-1 text-[12.5px]">
          <Tab active={screen === "start"}>Intake</Tab>
          <Tab active={screen === "call"}>Live call</Tab>
          <Tab active={screen === "sms"}>Resolution</Tab>
        </nav>
      </div>
      <div />
    </header>
  );
}

function Tab({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-md px-2 py-1 ${
        active ? "bg-secondary text-foreground" : "text-muted-foreground"
      }`}
    >
      {children}
    </span>
  );
}

function StartScreen({
  phone,
  setPhone,
  onPick,
  onStart,
  customers,
  backendStatus,
}: {
  phone: string;
  setPhone: (v: string) => void;
  onPick: (v: string) => void;
  onStart: () => void;
  customers: Customer[];
  backendStatus: BackendStatus;
}) {
  const [open, setOpen] = useState(false);
  const matched = customers.find((c) => c.phone === phone);
  return (
    <div className="flex h-full items-center justify-center px-8">
      <div className="w-full max-w-lg">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">New session</div>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight">
          What phone number is the customer calling from?
        </h1>
        <p className="mt-1.5 text-[13.5px] text-muted-foreground text-pretty">
          If the inbound number matches a known policyholder number, the agent says so and asks for PIN digits. Unknown numbers use name, birthdate, and PIN digit verification only.
        </p>
        <div className="mt-3 text-[12px] text-muted-foreground">
          Backend data: {backendStatus}
        </div>

        <div className="mt-6 flex items-center gap-2">
          <div className="relative flex flex-1 items-center rounded-md border border-input bg-card focus-within:ring-1 focus-within:ring-ring">
            <Phone className="ml-3 h-4 w-4 text-muted-foreground" />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+44 7700 900000"
              className="h-10 w-full bg-transparent px-2.5 text-sm tabular-nums outline-none placeholder:text-muted-foreground/60"
            />
            {matched && (
              <span className="mr-3 hidden rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary md:inline">
                Known policyholder · {matched.name}
              </span>
            )}
          </div>
          <Button onClick={onStart} disabled={!phone} className="h-10 gap-2">
            <Phone className="h-4 w-4" /> Start call
          </Button>
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            Demo phone numbers
          </button>
          {open && (
            <div className="mt-2 overflow-hidden rounded-md border border-border">
              <button
                type="button"
                onClick={() => onPick(UNKNOWN_DEMO_PHONE)}
                className="flex w-full items-center justify-between border-b border-border bg-warning/5 px-3 py-2 text-left text-[13px] hover:bg-warning/10"
              >
                <div>
                  <div className="font-medium">Unknown caller (name + DOB + PIN)</div>
                  <div className="text-[11.5px] text-muted-foreground">{UNKNOWN_DEMO_PHONE}</div>
                </div>
                <span className="text-[11px] uppercase tracking-wider text-[color:oklch(0.5_0.13_75)]">
                  Elevated risk
                </span>
              </button>
              <ul className="divide-y divide-border">
                {customers.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onPick(c.phone)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-accent"
                    >
                      <div>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-[11.5px] text-muted-foreground tabular-nums">
                          {c.phone} · {c.tier} · {c.vehicles.length} vehicle{c.vehicles.length > 1 ? "s" : ""}
                        </div>
                      </div>
                      <span className="font-mono text-[11px] text-muted-foreground">{c.vehicles[0].reg}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
