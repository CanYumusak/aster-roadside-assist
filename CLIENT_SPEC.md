# Insurance Co-Pilot Client Spec

## Purpose

This document captures the insurer-facing assumptions and decisions needed to move from prototype to production. The prototype uses backend-owned fake data, but the final product must integrate with the insurer's customer, vehicle, policy, roadside benefit, and dispatch systems.

## Prototype Assumptions

- All customer, vehicle, and policy data is synthetic and stored in backend fixtures.
- The frontend never imports customer or policy JSON directly; it calls backend APIs.
- The first UI step is entering the phone number the customer is calling from.
- After phone-number entry, the rest of the intake happens through the voice call.
- The customer does not see transcript, extracted fields, policy reasoning, or case state during intake.
- A separate operator-observability surface can show those details for the interviewer or human agent. See [AGENT_OBSERVATION_UI_SPEC.md](AGENT_OBSERVATION_UI_SPEC.md) for the dedicated observation UI spec.
- A right-side demo guide can show the presenter what to say: name, birthdate, requested PIN digits, known phone number, vehicle options, policy tier, and suggested incident details. These are all hardcoded into the client and not dynamic from the backend. 
- Caller lookup is simulated by entered phone number. (dropdown)
- Known-number flow explicitly tells the caller that the inbound number is recognized as a known policyholder number, then asks for PIN digits; a mismatch discards the intake and routes to human callback.
- Unknown-number verification uses only name, birthdate, and requested PIN digits inside the voice call, then shows the auth method as full verification in the operator view.
- No real SMS is sent; ordinary customer notifications are rendered as fake SMS in the UI. Unsafe safety-stop exits do not generate a simulated SMS.
- Coverage and provider decisions are based on synthetic policy and provider data.

## Demo UI Contract

The web UI should not become a claims form. It should simulate a phone-assisted roadside flow:

1. Enter caller phone number.
2. Start voice call.
3. Use the right-side demo guide to answer the voice agent naturally.
4. Complete the intake by speaking with the voice agent.
5. See the final fake SMS / notification.

The customer-facing surface should not show the case being filled in. Transcript, extracted facts, blocked actions, and coverage trace belong in the separate operator-observability surface.

The right-side demo guide is allowed because the prototype is simulating a phone call in a browser. It should adapt to the selected caller:

- Known-number caller: show that the inbound number matched a known policyholder number, plus name, birthdate, selected PIN digits, and known vehicles.
- Unknown-number caller: show name, birthdate, and requested PIN digits only. Do not offer policy number, registration, postcode, or other fallback lookup options in the prototype.
- Multi-car customer: show the available vehicle choices so the presenter can pick one during the call.
- Scenario prompt: show a short incident setup, such as flat tire, dead battery, motorway breakdown, or EV warning.
- Non-policyholder caller: show a suggested answer like "I am calling on behalf of the policyholder" and expect the demo to end in human callback.

## Voice Model Decision

Prototype choice: OpenAI Realtime with `gpt-realtime-2`.

Why:

- It supports a realistic low-latency speech-to-speech demo.
- It can call backend tools during the conversation.
- It has stronger instruction following for exact entity capture, tool use, and long-session state than simpler voice stacks.
- It lets the prototype show the core customer experience quickly.

Operating rule:

- The voice model is the interaction channel, not the claims decision-maker.
- The model must call backend tools to update facts and request the next step.
- The model must not approve coverage, deny coverage, or dispatch from memory.

Production options to discuss with the insurer:

- Stay with OpenAI Realtime if speed, tool use, and end-to-end speech experience are the priorities.
- Consider ElevenLabs Conversational AI if branded voice quality is the main differentiator.
- Consider Deepgram STT + separate LLM + TTS if compliance, transcript observability, and vendor flexibility become dominant.
- Keep the backend stable so the voice provider can be changed later.

## Phone Line Integration

The prototype simulates a phone call in the browser. Production must connect the voice agent to a real inbound phone line.

Client decisions needed:

- Should calls enter through the insurer's existing contact-center platform, SIP trunk, or a new provider such as Twilio / CCaaS?
- Who owns caller ID normalization, withheld-number handling, call routing, queueing, and human transfer?
- Can the production stack stream call audio to the realtime voice layer with acceptable latency?
- What is the fallback path if the AI service, telephony stream, or backend is unavailable?
- What call recording, consent, retention, and compliance requirements apply?

## Customer Lookup

Expected prototype flow:

1. Caller starts a roadside assistance request.
2. Backend looks up the customer by phone number.
3. Browser starts a voice call using a claim-specific realtime session.
4. If a customer is found, the agent asks for a partial PIN challenge.
5. If one vehicle is on the policy, the agent asks the customer to confirm it.
6. If multiple vehicles are on the policy, the agent asks which vehicle they are with.
7. If no customer is found, the agent verifies name, birthdate, and requested PIN digits.
8. If name, birthdate, or PIN mismatches, the intake is discarded and the call routes to human callback.
9. Successful unknown-number verification is shown as the full-verification auth method in the operator view.
10. If the caller says they are not the policyholder, the prototype gathers safety and incident basics, then ends in human callback.

Production questions for the insurer:

- Is phone number the right primary lookup key?
- Can multiple customers share one phone number?
- Can one customer have multiple policies or household policies?
- Are company, fleet, or named-driver vehicles in scope?
- How should withheld numbers and international numbers be handled?

## Authentication

Prototype behavior:

- Known-number caller: state that the inbound number matched a known policyholder number, then ask for selected digits of a roadside PIN.
- Unknown-number caller: verify name, birthdate, and requested roadside PIN digits only.
- Known-number caller PIN mismatch, or unknown-number name, birthdate, or PIN digit mismatch, discards the intake and routes to human callback.
- Accept the challenge when the selected demo credentials match.
- Mark the claim session as `authMode: "known_number_simulated"` or `authMode: "fallback_simulated"`.
- Mark unknown-number fallback sessions with an auth method such as `full_verification_simulated` for the operator-observability surface. Use specific attention flags, such as `unknown_number` or `auth_retry`, only when they explain an action or review need.

Production options:

- Reuse an existing customer phone PIN.
- Roll out a new roadside assistance PIN.
- Use knowledge-based checks such as postcode, registration, or date of birth.
- Route uncertain identity to a human agent.

Client decision needed:

- Does the insurer already have a phone PIN or equivalent authentication factor?
- If not, is it acceptable to introduce one?
- For low-risk roadside assistance, what can the AI do before full authentication?
- What actions require stronger verification: coverage confirmation, dispatch, taxi, rental car, payment, or policy changes?
- The product remains phone-first; SMS is used only for the final customer update, not authentication in this prototype.

## Unknown Phone Number Flow

This flow must exist in production. A customer may call from a borrowed phone if their own phone is dead, lost, damaged, out of signal, or locked in the broken-down vehicle.

Prototype verification:

- Customer name.
- Birthdate.
- Requested roadside PIN digits.

Recommended behavior:

- Allow the AI to perform immediate safety triage.
- Allow the AI to gather incident details.
- Mark the session as higher risk even after prototype verification because the caller number is unknown.
- Discard the intake and route to human callback if name, birthdate, or PIN digits mismatch.
- Require human review or stronger authentication before final coverage confirmation or dispatch when confidence is low.

## Non-Policyholder Caller

Prototype behavior:

- Ask whether the caller is the policyholder when identity is uncertain.
- If the caller is not the policyholder, continue safety triage and basic incident intake.
- Do not approve coverage or simulate dispatch.
- End the demo as `needs_human_callback`.
- Show a fake SMS saying a roadside specialist will call back as soon as one is available.

Production backlog:

- Define which third-party caller roles are allowed: spouse, named driver, passenger, parent, fleet manager, police, highways officer, or passerby.
- Define what the AI may disclose to each role.
- Define which roles can authorize dispatch or onward travel.
- Define whether policyholder consent is required before committing cost.

## Human Callback

Human callback is a terminal prototype outcome for customer-requested human help, non-policyholder callers, uncertain identity, high-risk safety cases, and low-confidence coverage decisions.

Example fake SMS:

```text
Aster Roadside: Your case has been sent to a roadside specialist.
They will call you back as soon as one is available.
Case ref: AST-1042.
If you are in immediate danger, call emergency services.
```

## Vehicle Selection

Expected behavior:

- One insured vehicle: ask the customer to confirm the vehicle.
- Two or more insured vehicles: ask the customer to choose from known vehicles.
- Unknown vehicle: collect registration, make, model, and relationship to policyholder.

Client decision needed:

- Does coverage follow the vehicle, the person, or both?
- Are temporary, hire, courtesy, or borrowed cars covered?
- What should happen if the customer is a passenger in someone else's car?
- Can the agent continue if the registration is missing or partially known?

## Policy And Coverage Data

Required production data:

- Active policy status.
- Covered roadside events.
- Exclusions.
- Assistance limits.
- Tow distance limits.
- Taxi, rental car, accommodation, and repatriation benefits.
- Annual callout limits.
- Policy geography.
- Named drivers and vehicle coverage.
- Effective and expiry dates.

Normalization goal:

Map insurer-specific policy products into a stable internal coverage object:

```text
PolicyCoverage
  policyId
  status
  coveredEvents
  exclusions
  assistanceBenefits
  limits
  geography
  escalationRules
```

## AI Decision Boundaries

The AI should:

- Ask concise follow-up questions.
- Extract structured claim facts.
- Explain coverage decisions in customer-friendly language.
- Generate the customer update from approved decision fields.

The AI should not independently:

- Invent policy terms.
- Override deterministic exclusions.
- Confirm dispatch for high-risk or uncertain cases.
- Make medical, legal, or liability decisions.
- Hide uncertainty from the customer or human operator.

## Intake Validation

Client-facing principle:

- The voice model should not decide when it has enough information.
- The backend state machine decides whether the agent can ask another question, check coverage, recommend an action, or escalate.

Required before coverage check:

- Identity confirmed.
- Vehicle confirmed.
- Location confirmed enough for roadside assistance.
- Incident type known.
- Safety risk level known.

Required before dispatch or dispatch simulation:

- Identity confirmed.
- Vehicle confirmed.
- Dispatchable location confirmed.
- Customer safety status known.
- Incident type known.
- Coverage status is covered or human-approved.
- Service type selected.
- Tow destination selected if towing is needed.

Validation rules:

- If safety is unknown, ask safety first.
- If the customer is unsafe, injured, in a live lane, near fire/smoke/flood, or reports EV high-voltage warnings, interrupt normal intake and escalate.
- Because the prototype simulates a phone call, capture location by voice only.
- If location is vague, ask for road name, direction, junction, service area, marker post, landmark, postcode, or another verbally supplied dispatch clue.
- The prototype uses Google Maps / Places lookup for addresses, postcodes, and landmarks, but this may not be sufficient for highway chainage or road-segment descriptions such as "A8 kilometer 400 between Munich and Berlin." Production should evaluate a dispatch-grade location approach, potentially including road-network data, marker posts, telematics, emergency-services location formats, or the insurer's existing roadside dispatch tooling.
- If spoken vehicle details conflict with the policy record, ask for confirmation.
- If the policy evidence is missing or ambiguous, require human review.
- If the expected service may exceed a policy limit, require human review.

The human console should show intake completeness and blocked actions, such as:

```text
Required for coverage:
[ok] Identity confirmed
[ok] Vehicle confirmed
[ok] Safety status known
[warn] Location partially confirmed
[ok] Incident classified

Blocked actions:
- Dispatch tow truck: location not confirmed
- Coverage denial: policy evidence not retrieved
- Repair truck: EV high-voltage warning possible
```

## Human Review Triggers

Require escalation when:

- Injury or immediate danger is reported.
- Caller identity is uncertain.
- Caller requests a human.
- Caller is not the policyholder in the prototype.
- Caller uses an unknown phone and cannot complete fallback verification.
- Vehicle is not recognized.
- Policy lookup fails or returns stale data.
- Coverage confidence is low.
- The scenario may involve an exclusion.
- Customer disputes the decision.
- Dispatch has material cost or safety risk.

## Client Integration Backlog

- Confirm data owners for customer, vehicle, policy, claims, and roadside benefits.
- Confirm authentication method and fallback identity checks.
- Define read-only APIs for customer and policy lookup.
- Define provider / garage / dispatch integration path.
- Define phone-call and SMS message templates.
- Define audit logs and retention requirements.
- Define security, privacy, and compliance requirements.
- Discuss security features: phone PIN, fallback verification, knowledge checks, fraud monitoring, call recording, and which actions require human approval.
- Agree prompt/data-minimization rules: the voice model should not receive full customer, vehicle, policy, or PIN records; it should fetch auth-appropriate fields through backend tools only after checks pass.
- Discuss dropped-call and poor-signal recovery as later production resilience, not prototype scope.
- Provide sandbox data and golden test cases.
- Agree pilot scope, success metrics, and human-review policy.
