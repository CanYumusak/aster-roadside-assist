import { cn } from "@/lib/utils";
import type { ObservedCase, SystemEvent, TranscriptTurn } from "@/lib/observation-data";
import { Ban, CheckCircle2, Info, MinusCircle, AlertTriangle } from "lucide-react";

function EventIcon({ status }: { status: SystemEvent["status"] }) {
  switch (status) {
    case "ok": return <CheckCircle2 className="size-3 text-success" />;
    case "blocked": return <Ban className="size-3 text-danger" />;
    case "skipped": return <MinusCircle className="size-3 text-muted-foreground" />;
    case "warn": return <AlertTriangle className="size-3 text-warning" />;
    default: return <Info className="size-3 text-subtle-fg" />;
  }
}

type Item =
  | { kind: "turn"; turn: TranscriptTurn }
  | { kind: "event"; event: SystemEvent };

export function TranscriptTimeline({ data }: { data: ObservedCase }) {
  // Interleave by time
  const items: Item[] = [
    ...data.transcript.map((t) => ({ kind: "turn" as const, turn: t })),
    ...data.events.map((e) => ({ kind: "event" as const, event: e })),
  ].sort((a, b) => {
    const at = a.kind === "turn" ? a.turn.time : a.event.time;
    const bt = b.kind === "turn" ? b.turn.time : b.event.time;
    return at.localeCompare(bt);
  });

  return (
    <div className="flex flex-col">
      {items.map((it, i) => {
        if (it.kind === "event") {
          const e = it.event;
          return (
            <div
              key={i}
              className="flex items-center gap-2 border-l-2 border-border/60 pl-3 ml-7 py-1.5 text-[11.5px] text-muted-foreground"
            >
              <EventIcon status={e.status} />
              <span className="font-mono text-[11px] text-subtle-fg">{e.type}</span>
              <span className="text-foreground/80">{e.label}</span>
              <span className="ml-auto font-mono text-[10.5px] text-subtle-fg">{e.time}</span>
            </div>
          );
        }
        const t = it.turn;
        const isAgent = t.speaker === "agent";
        return (
          <div key={i} className="flex gap-3 py-2.5">
            <div
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold uppercase tracking-tight",
                isAgent ? "bg-primary text-primary-foreground" : "bg-foreground/8 text-foreground border border-border",
              )}
            >
              {isAgent ? "AI" : "C"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[11.5px] font-medium text-foreground">
                  {isAgent ? "Agent" : "Caller"}
                </span>
                <span className="font-mono text-[10.5px] text-subtle-fg">{t.time}</span>
              </div>
              <p className="mt-0.5 text-[13.5px] leading-relaxed text-foreground">{t.text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
