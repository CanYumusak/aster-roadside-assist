import type { ObservedCase } from "@/lib/observation-data";

export type CaseTimestamp = {
  date: string;
  time: string;
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

export function caseTimestamp(data: ObservedCase): CaseTimestamp {
  if (data.updatedAt) {
    const value = new Date(data.updatedAt);
    if (!Number.isNaN(value.getTime())) {
      return {
        date: dateFormatter.format(value),
        time: timeFormatter.format(value),
      };
    }
  }

  const fallbackClock =
    data.events.at(-1)?.time ?? data.transcript.at(-1)?.time ?? data.lastUpdate;
  return {
    date: dateFormatter.format(new Date()),
    time: normalizeClock(fallbackClock),
  };
}

export function coverageOutcome(data: ObservedCase) {
  if (data.status === "not_covered") return "not_covered";
  if (data.status !== "completed") return null;
  if (data.coverageOutcome) return data.coverageOutcome;
  if (data.nextAction?.evaluated) return "covered";
  if (data.coverage?.rules?.some((rule) => rule.result === "fail")) return "not_covered";
  if (data.coverage?.evaluated) return "covered";
  return null;
}

function normalizeClock(value: string) {
  const parts = value.match(/\d{1,2}:\d{2}/);
  return parts?.[0] ?? value;
}
