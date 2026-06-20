# Lovable Prompt: Aster Observation UI

Build the human observation UI for Aster Roadside, an AI voice-agent prototype for roadside assistance. This is the internal screen used by human agents, QA reviewers, and interviewers to observe AI-handled phone calls. It is not customer-facing.

The design should feel like Linear: calm, precise, dense, keyboard-operator friendly, minimal chrome, excellent spacing, subtle hierarchy, and no decorative clutter. Keep it in the existing fake Aster insurance CI: white and off-white surfaces, restrained blue accent, dark neutral text, very light borders, and clean sans-serif typography. It should feel premium and operational, not like a marketing dashboard.

## Visual Thesis

An ultra-clean operations console for monitoring live AI roadside cases: white/blue insurance CI, Linear-like density, crisp dividers, restrained status color, and strong information hierarchy.

## Interaction Thesis

- The case board and selected case detail should feel connected: selecting a case updates the detail pane without a route change.
- Live updates should be implied through small timestamp/status changes, subtle pulse dots, and transcript rows appearing in order.
- Hover states should be quiet: row background shift, blue focus ring, and minimal icon reveal.

## Product Context

The customer is on a simulated phone call with an AI voice agent. The observation UI shows what happens on the other side:

- What the caller said.
- What the AI extracted.
- What the backend validated.
- Which actions were blocked.
- Why the case completed, routed to human callback, or stopped for safety.
- What SMS was generated, except unsafe safety-stop cases, where no SMS should be shown.

The backend is the source of truth. The UI should not imply that the LLM alone made coverage or dispatch decisions.

## Required Layout

Build a single-page `/observe` style workspace with three regions:

1. **Left rail / case board**
   - Width around 320-380px.
   - List of active and recent cases.
   - Compact rows, not big cards.
   - Each row shows case ref, status, auth method, policyholder or caller label, incident, last update, and attention flags.
   - Selected row has a subtle blue left border or soft blue background.

2. **Main detail workspace**
   - Header with selected case ref, live status, elapsed time, outcome, and attention flags.
   - Timeline/transcript view with caller and agent turns.
   - The transcript should be readable but not oversized.
   - Backend/tool events should appear as thinner, quieter system rows between transcript turns.

3. **Right inspector**
   - Width around 360-420px.
   - Structured facts, validation gates, coverage trace, next best action, and customer update.
   - Use sections separated by thin dividers, not nested cards.
   - This panel should be scrollable independently if content is tall.

Use a full-height app layout. No landing page, no hero, no marketing intro.

## Navigation And Top Bar

Top bar:

- Left: `Aster Roadside` and small label `Observation`.
- Center/left optional tabs: `Live`, `Callbacks`, `Completed`.
- Right: search, status filter, and a small `Demo data` indicator.

Keep the top bar thin, around 48-56px. Use subtle border-bottom.

## Case Board Details

Show 6-8 mock cases. Include these cases:

- Active safe intake, known phone match.
- Active full verification from unknown number.
- Human callback due to failed auth.
- Human callback because caller is not policyholder.
- Safety stop because caller is in traffic. This case must show `No SMS`.
- Completed flat tyre with repair truck.
- Completed dead battery with repair truck.
- Location unresolved case.

Case statuses:

- `Active`
- `Completed`
- `Human callback`
- `Safety stop`
- `Blocked`

Auth methods:

- `Phone match + PIN`
- `Full verification`
- `Not policyholder`
- `Unverified`

Attention flags should be specific, not generic risk labels:

- `unsafe`
- `auth retry`
- `auth failed`
- `unknown number`
- `location unclear`
- `incident unclear`
- `not policyholder`
- `no SMS`

Do not use generic risk labels. Use `Auth method` plus specific `Attention flags`.

## Selected Case Detail

Design the selected case around one active case by default. Suggested selected case:

`AST-8F41C2A9`, status `Safety stop`, caller said they are in the middle of the road. The UI should clearly show:

- Status: `Safety stop`.
- Reason: `Caller was not safely away from traffic.`
- Final agent message: `Get to safety and away from traffic now. Once you are safe, call Aster Roadside back please.`
- SMS: show `No SMS sent` because unsafe safety-stop exits do not generate simulated SMS.
- Car: do not show a car unless vehicle confirmation is true.

Transcript examples:

- Agent: `Aster Roadside, is everyone safe and away from traffic or immediate danger?`
- Caller: `No, I am in the middle of the road.`
- Agent: `Get to safety and away from traffic now. Once you are safe, call Aster Roadside back please.`

System/tool rows:

- `case.created`
- `safety.detected`
- `end_call requested`
- `case.finalized: safety stop`
- `sms.skipped`

## Right Inspector Sections

Use compact section headers and key/value rows.

### Case Summary

- Case ref.
- Status.
- Stage.
- Elapsed time.
- Last update.
- Outcome.

### Authentication

- Auth method.
- Verification result.
- PIN attempts if applicable.
- Do not expose full PINs.

### Extracted Facts

Rows:

- Name.
- Caller phone.
- Vehicle, only if confirmed.
- Location, if captured.
- Incident, if captured.
- Safety summary.

If a fact is missing, show a quiet `Not captured` label. For vehicle, prefer hiding the row when not confirmed in the safety-stop selected case.

### Validation Gates

Checklist rows:

- Safety checked.
- Identity verified.
- Vehicle confirmed.
- Location dispatchable.
- Incident classified.
- Coverage review allowed.
- SMS generated.

For the selected safety-stop case:

- Safety checked: blocked / unsafe.
- Identity verified: not reached.
- Vehicle confirmed: not reached.
- Coverage review allowed: blocked.
- SMS generated: skipped.

### Coverage Trace

For completed cases show policy and rule reasoning. For safety-stop show:

- `Coverage not evaluated`
- Reason: `Safety stop before intake`

### Next Best Action

For completed cases:

- Action type, provider, ETA.
- Example: `Repair truck`, `Aster Mobile Technician`, `35 min`.

For safety-stop:

- `No dispatch decision`
- Reason: `Caller must move away from traffic and call back.`

### Customer Update

For ordinary callback or completed cases, show the simulated SMS text.

For unsafe safety-stop cases, do not show an SMS card. Show a small neutral/destructive-tinted row:

`No SMS sent. The call ended so the caller can get to safety and call back once away from traffic.`

## Visual Style Rules

- Use mostly white and off-white backgrounds.
- Primary accent: Aster blue.
- Neutral text: dark slate/near-black.
- Borders: very light gray-blue.
- Use green only for completed/verified, amber only for needs attention, red only for safety/auth failure.
- No gradients.
- No decorative blobs or bokeh.
- No large dashboard cards.
- No cards inside cards.
- No rounded pill soup. Use compact chips only when they carry state.
- Use icons sparingly from lucide: `Radio`, `PhoneCall`, `ShieldCheck`, `AlertTriangle`, `CheckCircle2`, `MessageSquare`, `MapPin`, `Wrench`, `Clock`, `UserCheck`.
- Radius should be small, around 6-8px.
- Typography should be tight and readable. Do not use huge headings.
- Letter spacing should be 0 except small uppercase metadata labels.

## Hierarchy

Highest priority:

1. Current case status and whether human action is needed.
2. Why the case ended or is blocked.
3. Transcript and extracted facts.
4. Validation gates and backend decisions.
5. SMS / no-SMS customer update.

Avoid equal-weight panels. The selected case header and current outcome should be the most visible elements.

## Components To Build

- `ObservationPage`
- `CaseBoard`
- `CaseRow`
- `CaseDetailHeader`
- `TranscriptTimeline`
- `TimelineEvent`
- `InspectorPanel`
- `FactRows`
- `ValidationGates`
- `CoverageTrace`
- `NextBestAction`
- `CustomerUpdate`

Use mock data in the frontend. The shape should be easy to later wire to:

```text
GET /api/claims
GET /api/claims/{claimId}
WS /ws/cases
WS /ws/cases/{claimId}
```

## Mock Data Shape

Use data shaped roughly like:

```ts
type ObservedCase = {
  caseRef: string;
  status: "active" | "completed" | "human_callback" | "safety_stop" | "blocked";
  stage: string;
  authMethod: "phone_match_pin" | "full_verification" | "not_policyholder" | "unverified";
  attentionFlags: string[];
  callerPhone: string;
  policyholderName?: string;
  vehicleLabel?: string;
  vehicleConfirmed: boolean;
  incident?: string;
  location?: string;
  outcomeReason?: string;
  smsPreview?: string | null;
  transcript: Array<{ speaker: "agent" | "caller"; text: string; time: string }>;
  events: Array<{ type: string; status: string; label: string; time: string }>;
};
```

## Responsive Behavior

Desktop:

- Three-column layout.
- Left case board fixed width.
- Right inspector fixed width.
- Center fills remaining space.

Tablet:

- Case board collapses to a narrower list.
- Inspector can become a drawer or below the transcript.

Mobile:

- Not the primary target, but should not break.
- Use tabs: `Cases`, `Transcript`, `Facts`.

## Copy Tone

Use terse product UI copy:

- `Safety stop`
- `No SMS sent`
- `Coverage not evaluated`
- `Location unresolved`
- `Awaiting caller detail`
- `Human callback required`
- `Phone match + PIN`
- `Full verification`

Avoid explanatory marketing copy. Avoid saying the UI is "AI-powered" everywhere.

## Acceptance Criteria

- The screen immediately reads as an internal human observation console.
- It looks like Linear in restraint and hierarchy, but uses Aster white/blue CI.
- The selected safety-stop case clearly shows no SMS was sent.
- A car is not shown unless `vehicleConfirmed` is true.
- No generic risk-label wording appears anywhere.
- The UI makes backend validation and blocked actions visible without overwhelming the transcript.
- The result feels polished, quiet, and demo-ready.
