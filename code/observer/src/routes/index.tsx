import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useObservedCases } from "@/lib/backend-observation";
import { CaseBoard } from "@/components/observation/CaseBoard";
import { CaseSearchCommand } from "@/components/observation/CaseSearchCommand";
import { DetailHeader } from "@/components/observation/DetailHeader";
import { InspectorGrid } from "@/components/observation/Inspector";
import { BarChart3, Radio, Search, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aster Roadside · Observation" },
      { name: "description", content: "Internal observation console for AI-handled roadside calls." },
    ],
  }),
  component: ObservationPage,
});

function ObservationPage() {
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const { cases, usingFallbackData, loading, error, refreshedAt } = useObservedCases();

  useEffect(() => {
    if (cases.length === 0) {
      setSelectedRef(null);
      return;
    }
    if (!selectedRef || !cases.some((candidate) => candidate.caseRef === selectedRef)) {
      setSelectedRef(cases[0].caseRef);
    }
  }, [cases, selectedRef]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const selected = useMemo(
    () => cases.find((c) => c.caseRef === selectedRef) ?? cases[0] ?? null,
    [cases, selectedRef],
  );

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-3">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-sm bg-primary text-primary-foreground">
              <Radio className="size-3" />
            </div>
            <span className="text-[13px] font-semibold tracking-tight text-foreground">
              Aster Roadside
            </span>
            <span className="rounded border border-border bg-surface px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Observation
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/kpis"
            className="inline-flex h-7 items-center gap-1.5 rounded border border-border bg-surface px-2 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2"
          >
            <BarChart3 className="size-3.5 text-muted-foreground" />
            KPIs
          </Link>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-7 items-center gap-2 rounded border border-border bg-surface px-2 text-[12px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Search className="size-3.5" />
            <span>Search cases</span>
            <kbd className="rounded border border-border bg-background px-1.5 py-px font-mono text-[10px] text-subtle-fg">
              ⌘K
            </kbd>
          </button>
          <span className="flex items-center gap-1.5 rounded border border-border bg-surface px-2 py-1 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                error ? "bg-danger" : usingFallbackData ? "bg-warning" : "bg-success",
              )}
            />
            {error
              ? "Backend offline"
              : usingFallbackData
                ? "Demo fallback"
                : refreshedAt
                  ? `Live · ${refreshedAt.toLocaleTimeString()}`
                  : "Live"}
          </span>
        </div>
      </header>

      {/* Workspace */}
      <div className="flex min-h-0 flex-1">
        <CaseBoard cases={cases} selectedRef={selected?.caseRef ?? ""} onSelect={setSelectedRef} />

        <main className="flex min-w-0 flex-1 flex-col bg-surface/40">
          {selected ? (
            <>
              <DetailHeader data={selected} />
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="mx-auto flex max-w-6xl flex-col gap-3">
                  <InspectorGrid data={selected} />
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-6">
              <div className="max-w-sm text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background">
                  <WifiOff className="size-4 text-muted-foreground" />
                </div>
                <h2 className="mt-3 text-[14px] font-semibold text-foreground">
                  {loading ? "Loading cases" : error ? "Could not reach backend" : "No observed cases yet"}
                </h2>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                  {error ??
                    "Start a call in the customer demo. This console polls the backend and will show new cases automatically."}
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      <CaseSearchCommand
        cases={cases}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={(caseRef) => {
          setSelectedRef(caseRef);
          setSearchOpen(false);
        }}
      />
    </div>
  );
}
