# Agent Observation UI Client Spec

## Purpose

The agent observation UI is the internal surface for human agents, QA reviewers, and interviewers to watch AI-handled roadside cases and understand their outcomes. It is not customer-facing and does not replace the phone-call experience. Its job is to make the voice agent auditable: what the caller said, what the AI extracted, what the backend validated, what was blocked, and why the final outcome was completed, not covered, or routed to human callback.

## Product Goals

- Give a human reviewer a live view of every active roadside case.
- Make the backend state machine visible without exposing raw system prompts or hidden model instructions.
- Show whether the AI is following the required flow: safety, auth, vehicle, location, incident, coverage, next best action, SMS.
- Explain final outcomes clearly enough for a human agent to take over or review after the call.
- Preserve trust by separating observed facts, AI interpretations, backend decisions, and customer-facing messages.

## Primary Users

- Human roadside agent: monitors live sessions and handles callback/escalation cases.
- QA / operations lead: reviews completed cases, override reasons, model/tool behavior, and process quality.
- Interviewer / demo evaluator: sees that the prototype is not just a voice bot; it has observability, control boundaries, and auditability.

## Scope

### Prototype Scope

- Read-only live case observation.
- Case list with status, stage, risk flag, caller type, and outcome.
- Case detail view with transcript, structured facts, validation gates, tool calls, coverage trace, next best action, and final SMS.
- Live updates while the call is in progress.
- Clear terminal states: `completed`, `needs_human_callback`, `not_covered`, `abandoned`.

### Later Scope

- Human takeover / barge-in.
- Agent assignment and callback queue workflow.
- Case notes and disposition codes.
- Supervisor review, approvals, and overrides.
- Search across historical cases and transcript replay.
- QA scoring and model regression review.

## UX Principles

- Operational, not decorative: dense, quiet, scannable, and fast.
- The human should immediately see "what needs attention" and "why."
- Never make the reviewer infer state from a raw transcript alone.
- Every AI conclusion should be paired with the supporting backend field or policy rule.
- Use risk flags sparingly and consistently: unknown number, auth retry, unsafe caller, ambiguous location, unsupported incident, not policyholder, low coverage confidence.
- Keep customer PII visible only where it helps the human do the job; do not show PINs or hidden verification answers.

## Information Architecture

### Case Board

Columns:

- Case ref.
- Current stage.
- Status / outcome.
- Auth mode and risk.
- Caller phone.
- Policyholder name after verification.
- Vehicle.
- Incident.
- Location confidence.
- Next action.
- Last update time.

Filters:

- Active calls.
- Needs human callback.
- Completed.
- Not covered.
- Elevated risk.
- Unknown-number verification.
- Location unresolved.
- Coverage blocked.

Sort defaults:

- Active calls first.
- Human callback / elevated risk before ordinary completed cases.
- Newest activity first.

### Case Detail

Recommended layout:

- Header: case ref, live status, elapsed time, outcome, risk chips.
- Left rail: timeline of state transitions and tool calls.
- Main panel: transcript with speaker labels and timestamps.
- Right panel: extracted facts, validation gates, coverage trace, next best action, final SMS.

Important: this UI is for observation. In the prototype it should not mutate the call state.

## Required Case Detail Sections

### 1. Live Call State

Show:

- Call state: `ready`, `ringing`, `listening`, `speaking`, `thinking`, `completed`, `escalated`, `failed`.
- Current backend stage: lookup, verify, safety, vehicle, location, incident, coverage, action, SMS.
- Last backend event timestamp.
- Whether the voice session is connected.

### 2. Transcript

Show:

- Caller utterances.
- Agent utterances.
- Timestamps.
- Optional confidence / partial vs final transcript markers later.

Do not show:

- System prompts.
- Raw hidden instructions.
- Secret fields such as all PIN digits.

### 3. Auth And Risk

Show:

- Known-number vs unknown-number path.
- PIN digit challenge status, without exposing unasked digits.
- Retry count.
- Unknown-number elevated-risk flag.
- Human callback requirement after failed verification.
- Not-policyholder flag when applicable.

### 4. Extracted Facts

Show structured claim slots:

- Policyholder / caller identity.
- Caller relationship to policyholder.
- Vehicle selected.
- Location raw text.
- Location resolved address.
- Location confidence and Google Maps link when available.
- Incident summary.
- Canonical incident type.
- Safety summary.

Each fact should include:

- Value.
- Source turn or tool.
- Confidence where available.
- Confirmed / unconfirmed state.
- Last updated timestamp.

### 5. Validation Gates

Show the backend gates as explicit checklist rows:

- Identity verified.
- Safety checked.
- Vehicle confirmed.
- Location dispatchable and confirmed.
- Incident classified.
- Coverage review allowed.
- Dispatch simulation allowed.

Blocked actions should be visible with reasons, for example:

- `coverage_decision` blocked because incident is unclear.
- `dispatch_simulation` blocked because location is ambiguous.
- `automated_resolution` blocked because caller is not policyholder.

### 6. Tool And State Timeline

Show major backend/tool events:

- Claim created.
- Customer lookup result.
- PIN verification result.
- Fact updated.
- Location lookup result.
- Incident classification result.
- Coverage decision result.
- Provider match result.
- SMS generated.
- Human callback finalized.

Each event should show:

- Event type.
- Timestamp.
- Status: success, retry, blocked, escalated, error.
- Short reason.
- Redacted payload preview.

### 7. Coverage Trace

Show:

- Policy product used.
- Covered event match.
- Exclusions checked.
- Confidence.
- Escalation rules triggered.
- Decision rationale.

The UI should distinguish:

- Deterministic policy rule.
- AI-generated explanation.
- Human override later.

### 8. Next Best Action

Show:

- Recommended action: repair truck, tow truck, taxi, rental, human callback.
- Provider / garage selected.
- ETA.
- Reason for selection.
- Alternatives considered later.
- Customer-facing SMS text.

For human callback, show:

- Callback reason.
- Suggested human-agent opening summary.
- Safety warning if present.

## Live Update Transport

WebSockets are appropriate for this UI because operators need live transcript, state transitions, and terminal outcomes without refreshing. Use a REST snapshot plus WebSocket event stream:

```text
GET /api/claims
  Returns case summaries for the board.

GET /api/claims/{claimId}
  Returns the current complete case snapshot.

WS /ws/cases
  Streams case-level events for board updates.

WS /ws/cases/{claimId}
  Streams transcript, facts, tool calls, validation, and outcome events for one case.
```

Why not WebSocket-only:

- The UI must recover after refresh, reconnect, or missed events.
- Case detail should load from an authoritative snapshot first.
- WebSocket events should update the snapshot, not become the source of truth.

Fallback for prototype:

- If WebSocket setup costs too much time, poll `GET /api/claims/{claimId}` every 1 to 2 seconds for the demo.
- Keep the event data model the same so polling can be replaced by WebSockets later.

## Event Model

All events should share a stable envelope:

```json
{
  "eventId": "evt_123",
  "caseRef": "AST-1234ABCD",
  "type": "fact.updated",
  "occurredAt": "2026-06-19T22:41:00Z",
  "sequence": 42,
  "payload": {}
}
```

Initial event types:

- `case.created`
- `call.state_changed`
- `transcript.delta`
- `transcript.final`
- `auth.updated`
- `fact.updated`
- `validation.updated`
- `tool.called`
- `tool.completed`
- `coverage.decided`
- `action.selected`
- `sms.generated`
- `case.finalized`
- `case.error`

Ordering:

- Backend assigns a monotonically increasing `sequence` per case.
- Client ignores duplicate `eventId`.
- Client requests a fresh snapshot if a sequence gap is detected.

## Data Contract

### Case Summary

```text
CaseSummary
  caseRef
  status
  stage
  callerPhone
  policyholderName?
  authMode
  authRisk
  vehicleLabel?
  incidentType?
  locationLabel?
  locationConfidence?
  nextAction?
  callbackReason?
  createdAt
  updatedAt
```

### Case Snapshot

```text
CaseSnapshot
  summary
  transcript[]
  facts
  validation
  timeline[]
  coverageDecision?
  assistanceAction?
  smsPreview?
```

### Transcript Entry

```text
TranscriptEntry
  id
  speaker: caller | agent
  text
  final
  startedAt?
  endedAt?
```

### Observed Fact

```text
ObservedFact
  key
  value
  sourceEventId?
  confidence?
  confirmed
  updatedAt
```

## Security And Privacy

- Observation UI is internal only.
- Do not expose raw OpenAI keys, prompts, all PIN digits, or hidden system instructions.
- Redact verification payloads. Show requested PIN positions and pass/fail only.
- Show policyholder data only after the backend says auth passed, except for known-number internal lookup labels required by the demo.
- Record all observer actions later, especially if humans can override or take over.
- In production, protect the WebSocket with the same auth/session model as the internal operator portal.

## Prototype Implementation Plan

1. Extend backend claim state with an append-only event list in memory.
2. Emit events whenever claim state changes: create, auth, facts, validation, coverage, SMS, finalization.
3. Add `GET /api/claims` for board summaries.
4. Add `GET /api/claims/{claimId}` or reuse the current claim endpoint for full snapshots.
5. Add WebSocket stream after snapshots work.
6. Build a route such as `/observe` with case board and case detail.
7. Keep the existing slide-over operator panel as a lightweight per-case preview until `/observe` exists.

## Milestone Fit

For the interview demo, the minimum useful version is:

- A read-only case board.
- One selected case detail.
- Live or near-live stage/status/fact updates.
- Final outcome and SMS.
- Clear escalation reason when the case routes to human callback.

This is enough to pitch trust, operations readiness, and human-agent experience without building a full contact-center console.
