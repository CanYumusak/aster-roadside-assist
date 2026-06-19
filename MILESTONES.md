# Insurance Co-Pilot Milestones

## Delivery Principle

Ship the customer claim flow first. Human observability and production integrations matter, but the first demo must prove the core roadside journey: enter the caller phone number, start a voice call, identify the caller, confirm the vehicle, gather the incident facts, validate the intake, assess coverage, recommend the next action, and send a simulated customer update.

## Prototype Milestones

### Milestone 1: Client Flow Demo

Target: 1 day or less.

Goal: demonstrate the full customer-facing claim flow with backend-owned fake data.

- Build a start-claim UI using synthetic backend customers and policies.
- Add a right-side demo guide showing the selected caller's name, birthdate, requested PIN digits, vehicle options, policy tier, and suggested incident scenario.
- Recognize when the entered caller phone number is a known policyholder number.
- Start a voice call after phone-number lookup.
- Ask for a partial PIN challenge inside the voice call; mismatch routes to human callback.
- Confirm the known vehicle by voice when the customer has one car.
- Ask the customer to choose a vehicle by voice when they have multiple cars.
- Support an unknown-phone path by verifying name, birthdate, and requested PIN digits only.
- If the caller is not the policyholder, gather safety and incident basics, then end in human callback with a fake SMS.
- Keep the customer-facing UI to call state and final fake SMS; do not show the customer the case being filled in.
- Store transcript and extracted claim facts in backend claim state.
- Validate required intake fields before coverage review.
- Run synthetic coverage and next-best-action logic.
- Show the final customer update as a fake SMS / notification.

Exit criteria:

- Interviewer can choose from 10 fake caller phone numbers.
- Interviewer has enough right-side guide data to play the caller without opening JSON files.
- The demo works for one-car and multi-car customers.
- The demo has a believable unknown-number path with simulated name, birthdate, and PIN digit verification.
- Non-policyholder callers end in `needs_human_callback`.
- Coverage does not run until identity, vehicle, location, incident, and safety fields pass validation.
- The customer gets a clear result: covered, not covered, or human callback needed.

### Milestone 2: Voice Layer

Target: 0.5 to 1 day.

Goal: make the customer interaction feel like a voice-agent demo without risking demo reliability.

- Use OpenAI Realtime with `gpt-realtime-2` for the prototype voice call.
- Stream transcript updates into the same backend claim state.
- Ensure interruption, silence, or failed microphone permissions do not block the demo.
- Keep coverage and dispatch decisions behind backend tools and validation gates.

Exit criteria:

- User can complete the claim by simulated voice call.
- Transcript and extracted facts stay consistent with backend claim state.

### Milestone 3: Human Observability

Target: 0.5 to 1 day.

Goal: show how a human agent or QA lead can trust and evaluate the AI flow.

- Add operator view for transcript, claim slots, and missing facts.
- Show simulated auth status, including known-number PIN digit verification and unknown-number name, birthdate, and PIN digit verification.
- Flag unknown-number sessions as elevated risk in the operator view.
- Show intake completeness and blocked actions.
- Show coverage decision trace and escalation flags.
- Show human callback status and reason when the terminal outcome is `needs_human_callback`.
- Show next-best-action ranking and generated customer notification.
- Use REST snapshots first, then WebSocket events for live case board and case detail updates if time allows.

Exit criteria:

- A human reviewer can see why the agent made the recommendation.
- Any escalation reason is visible without reading raw model output.

### Milestone 4: PRD And Demo Packaging

Target: 0.5 day.

Goal: make the submission easy to evaluate in the live interview.

- Write the 2-page PRD.
- Include architecture, product scope, AI integration, guardrails, and risks.
- Record a short demo video covering the happy path and one escalation path.
- Prepare a concise walkthrough of technical tradeoffs and business outcomes.

Exit criteria:

- Prototype link, repo link, PRD, and demo recording are ready.
- The architecture can be explained end to end without handwaving over AI behavior.

## Production Milestones

### Milestone 5: Client Discovery And Data Contract

Target: 1 to 2 weeks after insurer kickoff.

Goal: turn demo assumptions into a real insurer implementation plan.

- Confirm systems of record for customers, phone numbers, vehicles, policies, claims, and roadside benefits.
- Define phone-number matching behavior, including duplicate customers, household policies, company vehicles, withheld numbers, and unknown callers.
- Confirm whether the insurer already has a customer phone PIN.
- Decide whether authentication should use existing PIN, new roadside PIN, phone-call knowledge checks, or human-agent verification.
- Define the AI data-minimization boundary: the voice prompt must not receive full customer, vehicle, policy, or PIN data; it should fetch only the next permitted field through backend tools after auth gates pass.
- Agree vehicle selection behavior for one vehicle, multiple vehicles, unknown vehicles, and borrowed vehicles.
- Define third-party caller handling for spouse, named driver, passenger, parent, fleet manager, police, highways officer, and passerby.
- Decide which non-policyholder roles can authorize dispatch or receive policy information.
- Discuss security features and risk appetite: phone PIN, fallback verification, knowledge checks, fraud monitoring, call recording, and what actions require human approval.
- Discuss dropped-call and poor-signal recovery as a later production resilience feature, not a prototype requirement.
- Define the normalized policy and coverage data model.
- Define audit requirements for customer lookup, policy reads, coverage decisions, human escalation, transcript retention, claim replay, and immutable case history.

Exit criteria:

- Client signs off on identity, auth, vehicle, and policy data contracts.
- Integration owners and access requirements are known.

### Milestone 6: Insurer User + Policy Database Integration

Target: 2 to 4 weeks with insurer technical access.

Goal: replace backend JSON fixtures with real read-only insurer integrations.

- Integrate with the insurer customer database for caller recognition, customer identity, and insured vehicle lookup.
- Integrate with the insurer policy database for active coverage, exclusions, roadside benefits, and policy limits.
- Replace prompt-injected customer context with scoped backend tool calls so prompt injection cannot exfiltrate other vehicles, policies, PINs, or hidden customer records.
- Preserve the same internal domain model used by the prototype.
- Add fallback behavior for missing customers, stale policy data, unknown vehicles, and insurer API downtime.
- Set up a sandbox data feed with synthetic-but-realistic records.
- Validate coverage decisions against insurer-provided golden test cases.

Exit criteria:

- Real customer and policy lookups work in sandbox.
- The system can explain and audit every coverage decision.
- Known error and fallback paths are tested with operations stakeholders.

### Milestone 7: Dispatch And Customer Communications

Target: 2 to 4 weeks after core integrations.

Goal: connect the decision engine to real operational workflows.

- Integrate with provider / garage / dispatch systems.
- Revisit dispatch-location resolution beyond Google Maps text lookup. The prototype can resolve many addresses, postcodes, and landmarks, but highway segment descriptions such as "A8 kilometer 400 between Munich and Berlin" may require road-network, marker-post, telematics, emergency-services, or specialist dispatch-location data instead of generic place search.
- Add real SMS integration for customer updates.
- Define when the AI can recommend dispatch vs when a human must approve.
- Add taxi, rental car, or accommodation workflows where policy allows.
- Add customer handoff messaging for not-covered and human-review cases.

Exit criteria:

- Dispatch actions are available in a controlled pilot path.
- Customer communications are approved by legal, compliance, and operations.

### Milestone 8: Production Pilot

Target: 2 to 4 weeks.

Goal: run with limited traffic and strong human oversight.

- Launch to a constrained segment, region, policy type, or call reason.
- Keep human review before final dispatch for high-risk cases.
- Monitor containment rate, escalation accuracy, average handle time, customer satisfaction, and override reasons.
- Build durable audit storage: serialize every case, transcript, tool call, state transition, policy evidence snapshot, coverage decision, notification, and human override into append-only object storage such as S3, with queryable case metadata in a NoSQL / document store for review and replay.
- Build an evaluation set from real reviewed cases.
- Version prompts, schemas, policy rules, and provider-ranking logic.

Exit criteria:

- Pilot metrics show faster handling without unacceptable coverage or dispatch errors.
- Operations has a clear go / no-go recommendation for broader rollout.

### Milestone 9: Scale-Up

Target: 1 to 2 months after pilot success.

Goal: expand automation while keeping controls proportional to risk.

- Broaden supported claim reasons and policy products.
- Reduce human review only where evaluation data proves reliability.
- Add more insurer-specific policy rules and provider workflows.
- Build continuous QA, incident review, and model improvement loops.
- Formalize privacy, retention, compliance, and security controls.
- Agree long-term audit retention and deletion policy for archived transcripts and case records, balancing operational traceability, regulatory requirements, and customer privacy.

Exit criteria:

- The insurer can scale from demo / pilot to an operational roadside assistance AI product.
