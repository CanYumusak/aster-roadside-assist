# Insurance Co-Pilot Architecture

## Goal

Build a focused demo of an AI voice agent for roadside assistance claims. The first prototype should prove the customer-facing flow end to end:

1. Customer starts a roadside assistance request.
2. Voice agent gathers the minimum required facts.
3. Backend turns the conversation into structured claim data.
4. AI checks synthetic policy coverage.
5. AI recommends the next best action.
6. Customer sees a clear status update, modeled as a fake SMS / notification.

Human observability is important, but it should be treated as the second surface after the client flow is credible. The demo should first answer: "Can the agent safely gather enough information and produce a defensible assistance decision?"

## System Shape

```text
Customer UI
  |
  | caller phone number
  v
Frontend App
  |
  | POST /api/claims
  v
Backend API
  |
  +--> Customer / Policy Lookup
  |      |
  |      +--> Synthetic backend fixtures
  |      +--> Caller recognition by phone number
  |      +--> Vehicle list / policy list
  |
  | WebRTC / WebSocket
  v
OpenAI Realtime Voice Session
  |
  | backend tool calls
  v
Backend API
  |
  +--> Conversation Orchestrator
  |      |
  |      +--> update_case_facts
  |      +--> validate_intake
  |      +--> get_next_step
  |      +--> Missing-info question selection from backend state
  |
  +--> Policy / Coverage Engine
  |      |
  |      +--> Synthetic customer policies
  |      +--> Rule checks
  |      +--> LLM explanation of coverage decision
  |
  +--> Next Best Action Engine
  |      |
  |      +--> Synthetic garage / provider data
  |      +--> Distance + availability ranking
  |      +--> Tow vs repair recommendation
  |
  +--> Notification Generator
         |
         +--> Fake SMS / customer update payload
```

## Frontend Architecture

The frontend should simulate a phone call, not a claims form. The customer-facing surface only asks for the phone number the customer is calling from, starts the voice call, shows simple call status, and displays the final fake SMS / notification after the call. The customer should not see the case being filled in during intake.

The prototype should also include a right-side demo guide for the person playing the caller. This is not customer-facing product UI; it is a demo aid. It should show the selected fake customer's name, birthdate, PIN digits, vehicle choices, policy tier, and suggested incident scenario so the interviewer or presenter can answer the voice agent naturally.

The prototype can include a separate operator-observability surface for the interviewer or human agent. That surface can show transcript, extracted facts, validation status, blocked actions, coverage trace, and auth flags.

### Customer Claim Flow

- Start screen asks: "What phone number is the customer calling from?"
- Backend looks up synthetic customer, vehicle, and policy data by that phone number.
- For a known policyholder number, the agent explicitly says it can see the caller is calling from a known policyholder number, then asks for selected digits of the roadside PIN to demonstrate the intended authentication step.
- Vehicle confirmation happens by voice. If one insured vehicle is found, the agent asks the customer to confirm it. If multiple vehicles are found, the agent asks which vehicle they are with.
- If the caller is using an unknown phone number, the voice agent runs three-step simulated verification only: name, birthdate, and PIN.
- If the caller is not the policyholder, the prototype should escalate to a human callback after safety and basic incident intake. It should not continue to automated coverage approval or dispatch simulation.
- Location is captured by voice only. The agent asks for road name, direction, junction, service area, landmark, postcode, or another verbally supplied dispatch clue. The prototype should not use browser geolocation or laptop location capture.
- Voice call panel shows call state only: ready, listening, thinking, speaking, completed, or escalated.
- After intake, backend runs coverage and next-best-action logic.
- Final screen shows the fake SMS / notification with what was assessed and what happens next.
- Human callback is a terminal demo outcome. The fake SMS should say a roadside specialist will call back as soon as one is available.

### Authentication And Lookup

The prototype should simulate authentication without blocking the demo:

- Lookup by entered caller phone number from backend fixtures.
- Known-number caller: state that the inbound number matched a known policyholder number, then ask for a partial PIN challenge, such as the 3rd and 5th digits.
- Unknown-number caller: verify name, birthdate, and requested roadside PIN digits. Do not offer policy number, registration, postcode, or other fallback identifiers in the prototype.
- Known-number caller PIN mismatch, or unknown-number name, birthdate, or PIN mismatch, discards the intake and routes to human callback.
- Accept prototype verification when the provided fields match the selected demo identity.
- Store `authMode` and `authRisk` so the operator-observability view can show whether verification was known-number simulated or fallback simulated.

Production authentication is a client decision:

- If the insurer already has a phone PIN, reuse it.
- If not, decide whether to roll out a roadside PIN or rely on phone-call knowledge checks for low-risk roadside assistance.
- If the caller is not calling from a known phone, agree whether production should support broader lookup identifiers such as policy number, registration, postcode, or known policy phone number. The prototype intentionally does not.
- Unknown-number flows should be allowed, because a customer may call from a borrowed phone when their phone is dead, lost, or left in the broken-down car.
- Higher-risk fallback authentication should limit what the AI can do: it can triage safety and gather details, but final coverage confirmation or dispatch may require stronger verification.

### Client-First UX Principles

- Keep the customer flow linear and obvious.
- Do not expose internal model complexity to the customer.
- Ask only for missing information; avoid repeating facts already captured.
- Always include a safety check early: road position, injuries, immediate danger.
- Present outcomes in plain language, with next steps and expected timing.
- Make escalation visible when the agent is uncertain or the case is sensitive.

### Human Observability Later

Add an agent-operator view after the customer call flow works. This is not customer-facing; it exists for the interviewer, human agent, QA lead, or operations reviewer.

Future observability surface:

- Live transcript.
- Extracted claim slots and confidence.
- Auth mode and risk flag, including unknown-number fallback verification.
- Coverage decision trace.
- Policy snippets or rules used.
- Next-best-action ranking.
- Escalation reason.
- Human callback queue status when the claim ends in `needs_human_callback`.
- Final customer notification.

This second view is mainly for trust, QA, and training, not for the first customer-facing proof.

See [AGENT_OBSERVATION_UI_SPEC.md](AGENT_OBSERVATION_UI_SPEC.md) for the dedicated client spec. The preferred production shape is REST snapshots plus WebSocket events: snapshots are the recovery/source-of-truth path, while WebSockets keep active case boards and case detail views live.

## Backend Architecture

The backend owns orchestration, structured state, policy evaluation, provider matching, and audit records. The frontend should stay thin.

### Core API Endpoints

```text
POST /api/claims
  Creates a new roadside assistance session from callerPhoneNumber.
  Looks up matching synthetic customer, vehicles, and policies.

POST /api/claims/{claimId}/realtime-session
  Creates a short-lived OpenAI Realtime session for the browser call.
  The session is configured with backend tools and claim-specific instructions.

POST /api/claims/{claimId}/facts
  Backend tool called by the voice model after each customer turn.
  Updates structured claim facts from the latest utterance.

POST /api/claims/{claimId}/next-step
  Backend tool called by the voice model after fact updates.
  Returns the next allowed action, question, or safety script.

POST /api/claims/{claimId}/finalize
  Runs coverage check, next-best-action selection, and notification generation.

GET /api/claims/{claimId}
  Returns the current claim state for UI refresh and future observability.

GET /api/claims
  Returns claim summaries for the future observation case board.

WS /ws/cases
  Streams case summary events for the future observation case board.

WS /ws/cases/{claimId}
  Streams transcript, fact, validation, tool, and outcome events for one observed case.
```

The prototype simulates a phone call through the realtime voice session. The backend claim state remains the source of truth; transcript and extracted facts are visible only in the operator-observability surface.

### Domain Objects

```text
Customer
  id, name, phone, policyId

Vehicle
  make, model, year, registration, coverageTier

Policy
  id, planName, coveredEvents, exclusions, assistanceLimits

ClaimSession
  id, callerPhoneNumber, customerId, authMode, status, transcript, intakeFacts, missingFacts, blockedActions, decision

IntakeFacts
  identity, vehicle, location, incident, safety, requestedOutcome

CoverageDecision
  covered, confidence, rationale, exclusionsChecked, escalationRequired

AssistanceAction
  actionType, providerId, etaMinutes, customerMessage

Provider
  id, name, type, location, capabilities, availability
```

Important intake fields should store metadata, not just values:

```text
Fact
  value
  source
  confidence
  confirmed
  timestamp
```

For example, a customer saying "I think I am near Reading services" is not enough for dispatch. The backend should preserve that uncertainty and ask follow-up voice questions about road, direction, junction, service area, marker post, landmark, or postcode before dispatch simulation.

### Intake Validation

Do not rely on the voice model to decide when intake is complete. The backend owns a state machine with required fields, validation rules, confidence scores, and blocked actions.

```text
Voice agent asks backend-approved question
  -> customer responds
  -> voice model calls update_case_facts
  -> backend updates structured claim facts
  -> backend validates required fields
  -> backend checks safety guardrails
  -> voice model calls get_next_step
  -> backend returns the next allowed action
```

Minimum required before coverage check:

```text
identity.confirmed = true
vehicle.confirmed = true
location.confirmed = true
incident.type is known
safety.risk_level is known
```

Minimum required before dispatch:

```text
identity.confirmed = true
vehicle.confirmed = true
location.confirmed = true
safety.customer_safe is known
incident.type is known
coverage_status is covered or human-approved
service_type is selected
destination is selected if towing
```

If validation fails, the backend returns `allowed_action: "ask_question"` and a single next question. Coverage checks and dispatch remain blocked until the validation gates pass.

### Conversation State Machine

```text
START
  -> CALLER_LOOKUP
  -> IDENTITY_VERIFICATION
  -> SAFETY_TRIAGE
  -> LOCATION_CAPTURE
  -> VEHICLE_CONFIRMATION
  -> INCIDENT_CLASSIFICATION
  -> MISSING_INFO_RESOLUTION
  -> POLICY_RETRIEVAL
  -> COVERAGE_DECISION
  -> HUMAN_REVIEW_IF_NEEDED
  -> NEXT_BEST_ACTION
  -> CUSTOMER_CONFIRMATION
  -> DISPATCH_SIMULATION
  -> CLOSE

ANY_STATE -> SAFETY_ESCALATION
```

### Orchestration Flow

1. Customer enters the phone number they are calling from.
2. Backend creates a claim session and looks up matching synthetic customer, vehicle, and policy data.
3. Frontend opens a voice call using the claim-specific realtime session.
4. Agent performs simulated PIN verification inside the call.
5. Agent confirms or selects the vehicle by voice.
6. Each customer response is appended to the transcript.
7. Voice model calls `update_case_facts` after each customer turn.
8. Backend validates structured intake facts and safety guardrails.
9. Voice model calls `get_next_step` and asks only the backend-approved question or script.
10. When intake validation passes, backend runs coverage and next-best-action logic.
11. Backend generates a customer-safe summary and fake SMS.
12. Claim is marked `completed`, `needs_human_callback`, or `not_covered`.

## AI Integration

Use AI where it creates leverage, not where deterministic code is safer.

### Voice Model Choice

Use `gpt-realtime-2` for the prototype voice call.

Rationale:

- The demo needs a convincing low-latency speech-to-speech experience.
- The agent must call backend tools after each customer turn.
- The model needs strong instruction following for exact vehicle, registration, location, and safety capture.
- The case study rewards a working voice flow more than a fully modular contact-center stack.

Use `reasoning.effort: "low"` initially to protect latency, then increase only if validation failures show the model needs more reasoning. The prompt should be narrow: update facts, call `get_next_step`, ask only the returned question, and never approve coverage or dispatch from memory.

Production hardening should also remove full customer records from the prompt. The voice model should not receive all vehicles, policy details, PINs, or hidden customer data up front, because a prompt-injection attempt could try to extract them. Instead, the Realtime session should receive a claim/session id plus minimal auth state, then fetch only the next permitted field through backend tools after the relevant security check passes.

Production framing should remain provider-agnostic:

- `gpt-realtime-2`: best early choice for fast end-to-end speech, tool use, and reasoning.
- ElevenLabs Conversational AI: good alternative if branded voice quality is the main client priority.
- Deepgram STT + separate LLM + TTS: stronger long-term architecture if compliance, transcript observability, and vendor flexibility dominate.

The non-negotiable design rule is that the voice provider is replaceable. The backend remains authoritative for intake validation, policy retrieval, coverage decisions, dispatch eligibility, audit logging, and human-review routing.

### Recommended Model Split

- Voice interaction:
  - Prototype: OpenAI Realtime with `gpt-realtime-2`.
- Claim extraction:
  - Realtime model extracts from each turn through `update_case_facts`.
  - Validate against a strict schema before updating claim state.
- Incident classification:
  - Backend calls a fast mini OpenAI model with structured output.
  - The classifier may return only a supported incident enum or no value.
  - The backend keeps coverage blocked when the classifier returns no value.
- Coverage reasoning:
  - Hybrid rule + LLM.
  - Deterministic rules decide known inclusions / exclusions.
  - LLM explains the decision in customer-friendly language.
- Next best action:
  - Deterministic ranking for provider distance, capability, and availability.
  - LLM generates the final plain-language update.

### Guardrails

- Schema validation on every extracted claim update.
- Backend state machine decides whether intake is complete.
- Prompt data minimization: do not inject complete customer, vehicle, policy, or PIN records into the voice prompt; expose scoped backend tools that return only auth-appropriate fields.
- Coverage check is blocked until identity, vehicle, location, incident, and safety facts meet validation thresholds.
- Dispatch simulation is blocked until stricter dispatch fields are complete.
- Required escalation for injuries, unsafe location, missing policy, low confidence, or policy exclusions.
- Required human callback for customer-requested human help, non-policyholder callers in the demo, uncertain identity, or safety-sensitive cases.
- No final dispatch in prototype; only simulated recommendation.
- Every AI-generated decision stores an audit object: input facts, policy data, model output, confidence, and final backend decision.
- Customer-facing language is generated from approved decision fields, not raw model reasoning.

## Data Strategy

For the prototype, keep all fake data backend-owned. The frontend should call backend APIs and should not import fixture JSON directly. This makes the demo architecture match the production shape, where the backend will integrate with the insurer's systems of record.

Use synthetic backend fixtures checked into the repo:

```text
data/customers.json
data/policies.json
data/providers.json
data/scenarios.json
```

The prototype should include 3 to 5 scenarios:

- Flat tire on safe residential street, covered, repair truck recommended.
- Engine failure on motorway shoulder, covered, tow truck and taxi recommended.
- Accident with possible injury, immediate human escalation.
- Out-of-country breakdown, not covered or needs review depending on policy.
- Dead battery near home, covered with repair truck.

## Delivery And Client Spec

See [MILESTONES.md](MILESTONES.md) for the prototype and production delivery plan.

See [CLIENT_SPEC.md](CLIENT_SPEC.md) for insurer-facing assumptions, integration requirements, authentication decisions, and rollout questions.

See [AGENT_OBSERVATION_UI_SPEC.md](AGENT_OBSERVATION_UI_SPEC.md) for the human-agent / QA observation UI.

## Production Architecture Considerations

- Persist claim sessions and transcript events in a database.
- Use event-driven processing for long-running actions like provider search and dispatch.
- Separate customer-visible decisions from internal reasoning traces.
- Version prompts, schemas, policy rules, and provider-ranking logic.
- Build an offline evaluation set from labeled roadside scenarios.
- Track containment rate, escalation accuracy, average handle time, claim completion rate, and customer satisfaction.
- Treat dropped-call and poor-signal recovery as later production resilience work: resume sessions, preserve partial intake, and avoid making the customer repeat confirmed facts.

## Key Risks

- Incorrect coverage decision creates financial, legal, and customer trust risk.
- Voice latency or interruption handling can make the experience feel worse than a human agent.
- Location ambiguity can lead to wrong dispatch.
- Google Maps / Places text lookup is a useful prototype resolver for landmarks, addresses, and postcodes, but production roadside dispatch may need road-network or marker-post-aware location services for motorway/highway segment descriptions.
- Model hallucination can invent policy terms or provider availability.
- Customers in unsafe situations need fast escalation, not a long AI dialog.
- Human agents need auditability before they will trust automation.

## Scope Boundary For The Demo

In scope:

- Customer-facing claim initiation.
- Simulated voice call.
- Structured data gathering.
- Synthetic coverage check.
- Synthetic provider recommendation.
- Fake SMS update.

Out of scope:

- Real policy administration integration.
- Real dispatch.
- Real SMS.
- Payment, claims adjudication, or repair authorization.
- Full human QA dashboard, until the customer flow is working.
