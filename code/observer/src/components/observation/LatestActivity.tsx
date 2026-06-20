import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TranscriptTimeline } from "./Transcript";
import type { ObservedCase } from "@/lib/observation-data";
import { ArrowUpRight, MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";

export function LatestActivity({ data }: { data: ObservedCase }) {
  const [open, setOpen] = useState(false);
  const recent = data.transcript.slice(-4);

  return (
    <section className="rounded-md border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <MessageSquareText className="size-3.5 text-muted-foreground" />
          <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Latest activity
          </h3>
          <span className="text-[11px] text-subtle-fg">
            · {data.transcript.length} turns
          </span>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button
              className="flex items-center gap-1 rounded border border-border bg-surface px-2 py-1 text-[11.5px] font-medium text-foreground transition-colors hover:bg-surface-2 cursor-pointer"
            >
              View full transcript
              <ArrowUpRight className="size-3" />
            </button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden p-0">
            <DialogHeader className="border-b border-border px-5 py-3">
              <DialogTitle className="font-mono text-[13px] font-semibold">
                {data.caseRef} · Full transcript
              </DialogTitle>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              <TranscriptTimeline data={data} />
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="px-4 py-3">
        {recent.length === 0 ? (
          <div className="text-[12px] text-muted-foreground">No turns yet.</div>
        ) : (
          <ul className="space-y-2">
            {recent.map((t, i) => {
              const isAgent = t.speaker === "agent";
              return (
                <li key={i} className="flex gap-2.5">
                  <span
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-semibold uppercase",
                      isAgent
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-surface text-foreground",
                    )}
                  >
                    {isAgent ? "AI" : "C"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[11px] font-medium text-foreground">
                        {isAgent ? "Agent" : "Caller"}
                      </span>
                      <span className="font-mono text-[10.5px] text-subtle-fg">{t.time}</span>
                    </div>
                    <p className="text-[12.5px] leading-snug text-foreground/90">{t.text}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
