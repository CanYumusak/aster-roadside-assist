# Agent Observation UI Client Spec

## Purpose

The observation UI is the internal console for human roadside agents, QA reviewers, and demo evaluators. The customer still experiences a phone call; this UI shows the other side of the system: what the AI heard, what it extracted, what the backend validated, what decisions were blocked, and why the case ended in dispatch, not covered, or human callback.

This is the trust layer. It should make clear that the voice model is not acting alone: backend state, policy rules, validation gates, and audit logs are visible to humans.

## Product Goals

- Let a human agent monitor active AI-handled roadside cases.
- Make every terminal outcome explainable without reading raw model output.
- Support human callback workflows when the AI cannot safely or confidently complete the case.
- Give QA and operations a replayable record of transcript, extracted facts, tool calls, validation, policy reasoning, and customer notification.
- Prove to the insurer that AI automation can reduce handle time while preserving control, reviewability, and customer safety.

## Primary Users

- **Roadside agent:** watches cases routed to callback and needs a concise handoff summary before calling the customer.
- **Operations lead:** reviews containment rate, escalation reasons, failed auth, unclear location, and model/tool behavior.
- **QA reviewer:** audits completed and escalated cases for correctness, tone, policy compliance, and missed safety issues.
- **Demo evaluator:** sees that the prototype has observability and backend guardrails, not just a voice interface.

## MVP Scope

Build a read-only observation console with:

- Case board for active and recently completed calls.
- Case detail view for one selected case.
- Live or near-live updates from backend state.
- Transcript with caller and agent turns.
- Extracted facts with source and confirmation state.
- Authentication method and result.
- Validation checklist and blocked actions.
- Coverage decision trace.
- Next best action and fake SMS preview.
- Human callback reason and suggested callback summary.
- Explicit no-SMS outcome for unsafe safety-stop cases.

Out of scope for the first demo:

- Human takeover / barge-in.
- Manual edits to claim facts.
- Dispatch approval workflows.
- Agent assignment queues.
- Historical search across all cases.
- QA scoring forms.

## UX Principles

- Operational, dense, and calm. This should feel like an internal insurance console, not a marketing dashboard.
- Surface attention items first: unsafe caller, auth failed, unknown number full verification, unclear location, unclassified incident, not policyholder, coverage blocked, human callback.
- Do not force the reviewer to infer system state from transcript alone.
- Separate four concepts visually: caller said, AI extracted, backend validated, policy decided.
- Do not expose system prompts, full PINs, OpenAI keys, hidden verification answers, or irrelevant PII.
- Use "auth method" and "attention flags" language, not generic risk labels.

## Information Architecture

### 1. Case Board

The board is the agent's queue. It should answer: which cases are active, which need a human, and which completed cleanly?

Recommended columns:

- Case ref.
- Status: active, completed, human callback, not covered, abandoned, failed.
- Current stage: lookup, safety, auth, vehicle, location, incident, coverage, action, SMS.
- Auth method: phone match + PIN, full verification, not policyholder, unverified.
- Caller phone.
- Policyholder name after verification.
- Vehicle.
- Location label and confidence.
- Incident type.
- Next action.
- Attention flags.
- Last update time.

Recommended filters:

- Active calls.
- Human callback.
- Completed.
- Auth failed.
- Unknown number / full verification.
- Unsafe caller.
- Location unresolved.
- Incident unclear.
- Coverage blocked.

Default ordering:

- Active calls first.
- Human callback and attention flags before routine completed cases.
- Newest update first.

### 2. Case Detail

The detail page is the audit and handoff view.

Recommended layout:

- Header: case ref, status, elapsed time, current stage, final outcome, attention flags.
- Left column: timeline of state transitions and backend/tool events.
- Center: transcript with speaker labels and timestamps.
- Right column: extracted facts, validation gates, coverage trace, next best action, SMS preview.

The prototype view is read-only. Humans can observe and understand; they cannot mutate call state yet.

## Required Detail Sections

### Live Case State

Show:

- Voice state: ringing, listening, speaking, thinking, completed, escalated, failed.
- Backend stage.
- Last event timestamp.
- Whether Realtime voice is connected.
- Whether the final customer update was generated, or intentionally skipped for a safety stop.

### Transcript

Show:

- Caller utterances.
- Agent utterances.
- Timestamp per final turn.
- Optional partial transcript markers later.

Do not show:

- System prompts.
- Tool schemas unless in developer/debug mode.
- Full PIN or hidden verification data.

### Authentication

Show:

- Auth method: phone match + requested PIN digits, full verification, not policyholder, unverified.
- Requested PIN positions only, not the full PIN.
- Attempt count.
- Verification result.
- Human callback requirement after failed verification.

For unknown numbers, label the flow as "full verification." Attention flags can still show specific reasons such as `unknown number`, `auth retry`, or `auth failed`.

### Extracted Facts

Show each claim slot:

- Caller / policyholder identity.
- Caller relationship to policyholder.
- Vehicle selected.
- Raw spoken location.
- Resolved address.
- Location confidence and maps link when available.
- Incident summary.
- Canonical incident type.
- Safety summary.

Each fact should include:

- Value.
- Source event or transcript turn.
- Confirmed / unconfirmed state.
- Confidence where applicable.
- Last updated time.

### Validation Gates

Display backend-owned gates as checklist rows:

- Safety checked.
- Identity verified or human callback selected.
- Vehicle confirmed.
- Location dispatchable and confirmed.
- Incident classified.
- Coverage review allowed.
- Dispatch simulation allowed.
- SMS generated.

Blocked actions should include a reason:

- Coverage blocked because incident is unclear.
- Dispatch blocked because location is ambiguous.
- Automated resolution blocked because caller is not the policyholder.
- Case ended because caller was not safely away from traffic.

### Tool And State Timeline

Show major events:

- Case created.
- Customer lookup completed.
- PIN / identity verification completed.
- Fact updated.
- Location lookup completed.
- Incident classified.
- Coverage decided.
- Provider selected.
- SMS generated.
- Case finalized.

Each event should show:

- Event type.
- Timestamp.
- Status: success, retry, blocked, escalated, error.
- Short human-readable reason.
- Redacted payload preview.

### Coverage Trace

Show:

- Policy product used.
- Covered event match.
- Exclusions checked.
- Assistance benefits used.
- Confidence / uncertainty.
- Human escalation rule if triggered.
- Plain-English rationale.

Visually distinguish:

- Deterministic policy rule.
- AI classification or summarization.
- Future human override.

### Next Best Action

Show:

- Recommended action: repair truck, tow truck, taxi, rental, human callback, no automated action.
- Provider or garage selected.
- ETA.
- Reason for selection.
- Customer-facing SMS text.
- No-SMS safety-stop state when the caller is not safely away from traffic.

For human callback, show:

- Callback reason.
- Suggested opening line for the human agent.
- Known facts already collected.
- Missing facts the human should ask for.
- Safety warning if present.

## Live Update Transport

Use a REST snapshot plus WebSocket events.

```text
GET /api/claims
  Returns case summaries for the board.

GET /api/claims/{claimId}
  Returns a complete case snapshot.

WS /ws/cases
  Streams board-level case summary updates.

WS /ws/cases/{claimId}
  Streams transcript, fact, validation, tool, coverage, SMS, and outcome events for one case.
```

Why this shape:

- REST snapshots make refresh and reconnect reliable.
- WebSockets keep the board and detail view live without polling.
- Backend remains the source of truth; events update the snapshot, not replace it.

Prototype fallback:

- Poll `GET /api/claims` and `GET /api/claims/{claimId}` every 1 to 2 seconds if WebSockets cost too much time.
- Keep the same event envelope so polling can be replaced by WebSockets later.

## Event Model

All events should use a stable envelope:

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

```text
CaseSummary
  caseRef
  status
  stage
  callerPhone
  policyholderName?
  authMethod
  attentionFlags[]
  vehicleLabel?
  incidentType?
  locationLabel?
  locationConfidence?
  nextAction?
  callbackReason?
  createdAt
  updatedAt
```

```text
CaseSnapshot
  summary
  transcript[]
  facts[]
  validation[]
  timeline[]
  coverageDecision?
  assistanceAction?
  smsPreview?
```

```text
TranscriptEntry
  id
  speaker: caller | agent
  text
  final
  startedAt?
  endedAt?
```

```text
ObservedFact
  key
  value
  sourceEventId?
  sourceTranscriptEntryId?
  confidence?
  confirmed
  updatedAt
```

## Security And Privacy

- Internal-only UI behind insurer operator authentication.
- No OpenAI keys, prompts, full PINs, hidden system instructions, or raw secret payloads.
- Redact verification payloads; show requested PIN positions and pass/fail only.
- Gate policyholder PII behind successful backend auth wherever possible.
- Log all future human actions: view, override, assignment, callback, dispatch approval.
- Use least-privilege roles for agents, supervisors, QA reviewers, and demo users.
- Production storage should support replay, retention policy, deletion policy, and regulatory audit.

## Prototype Implementation Plan

1. Add an append-only in-memory case event list to the backend.
2. Emit events for claim creation, auth, fact updates, validation, location lookup, incident classification, coverage, SMS, and finalization.
3. Add `GET /api/claims` for board summaries.
4. Add `GET /api/claims/{claimId}` for full snapshots.
5. Build `/observe` with board and detail panes.
6. Add WebSocket streams after REST snapshots work.
7. Keep the existing right-side presenter guide separate; it is a demo aid, not the human-agent observation product.

## Demo Success Criteria

- Interviewer can run a voice call and watch the observation UI update.
- A human can immediately tell whether the case completed or needs callback.
- The reason for callback is clear without reading hidden prompts.
- Extracted facts match what the caller said.
- Coverage and next best action are visibly backend-owned.
- The final SMS shown to the customer matches the case outcome.
- Unsafe safety-stop cases clearly show that no SMS was sent.
