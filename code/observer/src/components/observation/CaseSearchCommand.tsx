import type { ObservedCase } from "@/lib/observation-data";
import { caseTimestamp, coverageOutcome } from "./case-format";
import { STATUS_LABEL, StatusBadge } from "./StatusBits";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export function CaseSearchCommand({
  cases,
  open,
  onOpenChange,
  onSelect,
}: {
  cases: ObservedCase[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (caseRef: string) => void;
}) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search case ref, caller, phone, incident, or status..." />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>No cases found.</CommandEmpty>
        <CommandGroup heading="Cases">
          {cases.map((observedCase) => {
            const timestamp = caseTimestamp(observedCase);
            return (
              <CommandItem
                key={observedCase.caseRef}
                value={searchValue(observedCase)}
                onSelect={() => onSelect(observedCase.caseRef)}
                className="items-start gap-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-mono text-[12px] font-semibold">
                      {observedCase.caseRef}
                    </span>
                    <StatusBadge status={observedCase.status} />
                  </div>
                  <div className="mt-1 truncate text-[12px] text-muted-foreground">
                    {observedCase.callerLabel} · {observedCase.incident ?? observedCase.stage}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-[11.5px] text-foreground">{timestamp.time}</div>
                  <div className="mt-0.5 text-[10.5px] text-subtle-fg">{timestamp.date}</div>
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

function searchValue(data: ObservedCase) {
  return [
    data.caseRef,
    data.callerLabel,
    data.callerPhone,
    data.incident,
    data.location,
    data.stage,
    STATUS_LABEL[data.status],
    coverageOutcome(data) === "covered" ? "covered" : undefined,
    coverageOutcome(data) === "not_covered" ? "not covered" : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}
