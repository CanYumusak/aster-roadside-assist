import { useState } from "react";
import type { ObservedCase } from "@/lib/observation-data";
import { caseTimestamp } from "./case-format";
import { FlagChip, StatusBadge } from "./StatusBits";
import { TranscriptTimeline } from "./Transcript";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CalendarDays, MessageSquareText, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";

export function DetailHeader({ data }: { data: ObservedCase }) {
  const [open, setOpen] = useState(false);
  const timestamp = caseTimestamp(data);
  const tone =
    data.status === "not_covered" || data.status === "cancelled"
      ? "border-danger/20 bg-danger-soft/40"
      : data.status === "needs_human_callback"
      ? "border-warning/20 bg-warning-soft/40"
      : data.status === "completed"
      ? "border-success/20 bg-success-soft/40"
      : "border-primary/20 bg-primary-soft/40";

  return (
    <div className="border-b border-border bg-background">
      <div className="flex items-center justify-between gap-4 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="font-mono text-[13px] font-semibold text-foreground">{data.caseRef}</h1>
          <span className="text-[12px] text-muted-foreground">·</span>
          <StatusBadge status={data.status} />
          <span className="text-[12px] text-muted-foreground">·</span>
          <span className="text-[12.5px] text-muted-foreground">{data.stage}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button
                className="flex items-center gap-1.5 rounded border border-border bg-surface px-2.5 py-1 text-[11.5px] font-medium text-foreground transition-colors hover:bg-surface-2 cursor-pointer"
              >
                <MessageSquareText className="size-3.5 text-muted-foreground" />
                View transcript
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
          <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <PhoneCall className="size-3.5" />
            <span className="font-mono">{data.callerPhone}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <CalendarDays className="size-3.5" />
            <span className="font-mono">{timestamp.time}</span>
            <span className="text-subtle-fg">{timestamp.date}</span>
          </div>
        </div>
      </div>

      {(data.outcomeReason || data.attentionFlags.length > 0) && (
        <div className={cn("border-t border-border px-5 py-2.5", tone)}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {data.outcomeReason && (
                <div className="text-[12.5px] text-foreground">
                  <span className="font-medium">Reason: </span>
                  <span className="text-foreground/85">{data.outcomeReason}</span>
                </div>
              )}
              {data.finalAgentMessage && (
                <div className="mt-1 text-[12px] text-muted-foreground">
                  <span className="uppercase tracking-wide text-[10px] font-semibold">Final agent message · </span>
                  <span className="italic">"{data.finalAgentMessage}"</span>
                </div>
              )}
            </div>
            {data.attentionFlags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 justify-end shrink-0">
                {data.attentionFlags.map((f) => (
                  <FlagChip key={f} flag={f} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
