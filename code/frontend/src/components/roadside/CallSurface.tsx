import { useEffect, useState } from "react";
import { STAGES, type CallState, type Stage } from "@/lib/roadside-data";
import { Phone, PhoneCall, PhoneOff, ChevronRight, Loader2, Mic, Volume2, CheckCircle2, AlertOctagon } from "lucide-react";
import { Button } from "@/components/ui/button";

export type VoiceConnectionStatus = "idle" | "connecting" | "connected" | "error";

type Props = {
  callState: CallState;
  stageIndex: number;
  onStart: () => void;
  onEnd: () => void;
  onNext: () => void;
  customerName: string;
  callerPhone: string;
  authRisk: "standard" | "elevated";
  voiceStatus: VoiceConnectionStatus;
  voiceError: string | null;
};

const STATE_COPY: Record<CallState, { label: string; sub: string }> = {
  Ready: { label: "Ready", sub: "Awaiting connection" },
  Ringing: { label: "Ringing", sub: "Connecting the voice agent" },
  Listening: { label: "Listening", sub: "Customer is speaking" },
  Thinking: { label: "Thinking", sub: "Agent is processing" },
  Speaking: { label: "Speaking", sub: "Agent is responding" },
  Completed: { label: "Completed", sub: "Call resolved, SMS sent" },
  Escalated: { label: "Escalated", sub: "Routed to human handler" },
};

export function CallSurface({
  callState,
  stageIndex,
  onStart,
  onEnd,
  onNext,
  customerName,
  callerPhone,
  authRisk,
  voiceStatus,
  voiceError,
}: Props) {
  const currentStage: Stage | null = stageIndex >= 0 ? STAGES[stageIndex] : null;
  const isLive =
    (voiceStatus === "connected" || voiceStatus === "connecting") &&
    callState !== "Ready" &&
    callState !== "Completed" &&
    callState !== "Escalated";

  return (
    <div className="flex h-full flex-col">
      {/* Stage rail */}
      <div className="border-b border-border bg-surface px-8 py-3">
        <StageRail stageIndex={stageIndex} callState={callState} />
      </div>

      {/* Call card */}
      <div className="flex flex-1 items-center justify-center px-8 py-10">
        <div className="w-full max-w-xl rounded-xl border border-border bg-card">
          {/* Caller header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Inbound call
              </div>
              <div className="mt-0.5 text-sm font-medium tabular-nums">{callerPhone || "—"}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {authRisk === "standard" ? "Known policyholder number" : "Unknown number"}
              </div>
              <div className="mt-0.5 text-sm font-medium">{customerName}</div>
            </div>
          </div>

          {/* Voice surface */}
          <div className="px-6 py-10">
            <div className="flex flex-col items-center gap-6">
              <StateBadge state={callState} authRisk={authRisk} />
              <Waveform active={isLive} state={callState} />
              <div className="text-center">
                <div className="text-base font-medium tracking-tight">
                  {STATE_COPY[callState].label}
                </div>
                <div className="mt-0.5 text-[13px] text-muted-foreground">
                  {currentStage ? `Stage · ${currentStage}` : STATE_COPY[callState].sub}
                </div>
                <VoiceStatus status={voiceStatus} error={voiceError} />
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between border-t border-border px-6 py-3">
            {callState === "Ready" ? (
              <Button onClick={onStart} className="gap-2">
                <Phone className="h-4 w-4" /> Start call
              </Button>
            ) : (
              <Button onClick={onEnd} variant="outline" className="gap-2">
                <PhoneOff className="h-4 w-4" /> End call
              </Button>
            )}
            <Button
              onClick={onNext}
              variant="secondary"
              disabled={callState === "Ready" || callState === "Completed" || callState === "Escalated"}
              className="gap-2"
            >
              Next step <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VoiceStatus({
  status,
  error,
}: {
  status: VoiceConnectionStatus;
  error: string | null;
}) {
  if (status === "idle") {
    return <div className="mt-2 text-[12px] text-muted-foreground">Voice model idle</div>;
  }

  if (status === "connecting") {
    return (
      <div className="mt-2 text-[12px] text-muted-foreground">
        Connecting to gpt-realtime-2...
      </div>
    );
  }

  if (status === "connected") {
    return <div className="mt-2 text-[12px] text-primary">Live voice connected</div>;
  }

  return (
    <div className="mx-auto mt-2 max-w-sm text-balance text-[12px] text-destructive">
      {error ?? "Voice connection failed."}
    </div>
  );
}

function StageRail({ stageIndex, callState }: { stageIndex: number; callState: CallState }) {
  return (
    <ol className="flex items-center gap-1 overflow-x-auto">
      {STAGES.map((stage, i) => {
        const done = i < stageIndex || callState === "Completed" || callState === "Escalated";
        const active = i === stageIndex && callState !== "Completed" && callState !== "Escalated";
        return (
          <li key={stage} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] transition-colors ${
                active
                  ? "bg-primary-soft text-primary"
                  : done
                  ? "text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  active ? "bg-primary pulse-dot" : done ? "bg-primary" : "bg-border-strong"
                }`}
              />
              {stage}
            </div>
            {i < STAGES.length - 1 && (
              <span className="text-border-strong">·</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StateBadge({ state, authRisk }: { state: CallState; authRisk: "standard" | "elevated" }) {
  const map = {
    Ready: { icon: Phone, cls: "text-muted-foreground border-border bg-background" },
    Ringing: { icon: PhoneCall, cls: "text-primary border-primary/30 bg-primary-soft" },
    Listening: { icon: Mic, cls: "text-primary border-primary/30 bg-primary-soft" },
    Thinking: { icon: Loader2, cls: "text-foreground border-border bg-surface" },
    Speaking: { icon: Volume2, cls: "text-primary border-primary/30 bg-primary-soft" },
    Completed: { icon: CheckCircle2, cls: "text-[color:var(--success)] border-[color:var(--success)]/30 bg-[color:var(--success)]/10" },
    Escalated: { icon: AlertOctagon, cls: "text-destructive border-destructive/30 bg-destructive/10" },
  } as const;
  const Icon = map[state].icon;
  const spin = state === "Thinking";
  return (
    <div className="flex items-center gap-2">
      <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium ${map[state].cls}`}>
        <Icon className={`h-3 w-3 ${spin ? "animate-spin" : ""}`} />
        {state}
      </div>
      {authRisk === "elevated" && (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-[12px] font-medium text-[color:oklch(0.5_0.13_75)]">
          Auth risk: elevated
        </div>
      )}
    </div>
  );
}

function Waveform({ active, state }: { active: boolean; state: CallState }) {
  // Restrained: 24 thin bars
  const bars = 28;
  const [seed, setSeed] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setSeed((s) => s + 1), 600);
    return () => clearInterval(t);
  }, [active]);

  const intensity = state === "Listening" ? 1 : state === "Speaking" ? 0.85 : state === "Ringing" ? 0.45 : state === "Thinking" ? 0.3 : 0.15;

  return (
    <div className="flex h-20 items-center gap-[3px]">
      {Array.from({ length: bars }).map((_, i) => {
        const base = 0.2 + ((Math.sin((i + seed) * 1.3) + 1) / 2) * 0.8;
        const h = active ? base * intensity * 100 : 8;
        const delay = (i % 6) * 90;
        return (
          <span
            key={i}
            className={`block w-[3px] rounded-full ${
              active ? "wave-bar bg-primary" : "bg-border-strong"
            }`}
            style={{
              height: `${Math.max(6, h)}%`,
              animationDelay: `${delay}ms`,
            }}
          />
        );
      })}
    </div>
  );
}
