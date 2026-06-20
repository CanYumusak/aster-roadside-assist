import { cn } from "@/lib/utils";
import type { ObservedCase } from "@/lib/observation-data";
import { caseTimestamp } from "./case-format";
import { AUTH_LABEL, StatusBadge } from "./StatusBits";

export function CaseBoard({
  cases,
  selectedRef,
  onSelect,
}: {
  cases: ObservedCase[];
  selectedRef: string;
  onSelect: (ref: string) => void;
}) {
  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-10 items-center justify-between border-b border-border px-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Cases
        </span>
        <span className="text-[11px] text-subtle-fg">{cases.length} total</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {cases.map((c) => {
          const selected = c.caseRef === selectedRef;
          const timestamp = caseTimestamp(c);
          return (
            <button
              key={c.caseRef}
              onClick={() => onSelect(c.caseRef)}
              className={cn(
                "group relative block w-full cursor-pointer border-b border-border px-3 py-2.5 text-left transition-colors",
                "hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                selected && "bg-primary-soft/60",
              )}
            >
              {selected && (
                <span className="absolute inset-y-0 left-0 w-[2px] bg-primary" />
              )}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[11.5px] font-medium text-foreground truncate">
                    {c.caseRef}
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-[10.5px] text-foreground">{timestamp.time}</div>
                  <div className="text-[9.5px] text-subtle-fg">{timestamp.date}</div>
                </div>
              </div>

              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-medium text-foreground">
                  {c.callerLabel}
                </span>
                <StatusBadge status={c.status} />
              </div>

              <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
                {c.incident ?? c.outcomeReason ?? c.stage}
              </div>

              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-[10.5px] text-subtle-fg">{AUTH_LABEL[c.authMethod]}</span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
