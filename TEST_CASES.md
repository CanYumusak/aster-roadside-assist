# Aster Roadside Test Cases

Last local run: all scenarios passed against the Spring Boot backend on `http://127.0.0.1:8081`.

These tests simulate the backend contract used by the Realtime voice tools: create claim, verify identity, record vehicle/location/incident facts, finalize coverage or terminal routing, and assert the customer update outcome.

| # | Scenario | Caller setup | Simulated caller facts | Expected result |
|---|---|---|---|---|
| 1 | Covered flat tyre | Maya Thompson, known phone, correct PIN digits `8` and `2` | Toyota Yaris, Beaconsfield Services, puncture/front tyre flat | `COMPLETED`; repair truck action; simulated SMS generated |
| 2 | Basic policy not covered | James Okafor, known phone, correct PIN digits `1` and `2` | VW Golf, Reading Services M4, engine cut out/no power | `NOT_COVERED`; no dispatch action; not-covered SMS generated |
| 3 | EV warning human review | Sofia Martins, known phone, correct PIN digits `4` and `6` | Hyundai Kona Electric, Cabot Circus, red battery warning/reduced power | `NEEDS_HUMAN_CALLBACK`; specialist callback SMS generated |
| 4 | Known caller wrong PIN | Maya Thompson, known phone, three wrong PIN attempts | No intake beyond auth | Attempts 1-2 return `retry_pin`; attempt 3 returns `cancellationRequired=true`; claim is `CANCELLED`; no SMS |
| 5 | Unknown number verified | Unknown phone, Alex Carter, DOB `1988-02-19`, PIN digits `5` and `2` | Vauxhall Astra, Plough Lane Stadium, flat tyre | `COMPLETED`; customer resolved to `cust-011`; simulated SMS generated |
| 6 | Unknown number failed verification | Unknown phone, wrong name/DOB/PIN repeated three times | No intake beyond auth | Claim is `CANCELLED`; no SMS |
| 7 | Ambiguous location clarification | Maya Thompson, known phone, correct PIN | Caller first says `Tesco Wimbledon`; backend returns candidates; caller confirms one candidate | First location is not dispatchable and has candidates; confirmed candidate becomes dispatchable and location-confirmed |
| 8 | Unsafe caller safety stop | Maya Thompson, known phone | Caller is not safely away from traffic | `NEEDS_HUMAN_CALLBACK` with `Closed` stage; no SMS; no dispatch |

## Demo Acceptance Criteria

- Wrong PIN never creates a callback SMS. It retries up to three attempts, then cancels the claim because the caller could not be identified.
- Unsafe safety stop never sends a simulated SMS. The caller is told to get safe and call back.
- Human callback is reserved for cases that need operational review, such as EV high-voltage risk, non-policyholder callers, unclear incident, or policy-data gaps.
- Coverage and next-best-action decisions happen only after identity, vehicle, dispatchable location, and incident are recorded.
- The observer UI can distinguish `COMPLETED`, `NOT_COVERED`, `NEEDS_HUMAN_CALLBACK`, and `CANCELLED`.

## Local Verification Command

The latest run used a shell harness that calls:

- `POST /api/claims`
- `POST /api/claims/{id}/verify-known-pin`
- `POST /api/claims/{id}/verify-unknown-identity`
- `POST /api/claims/{id}/facts`
- `POST /api/claims/{id}/finalize`
- `POST /api/claims/{id}/human-callback`
- `GET /api/claims/{id}`

All eight scenarios passed with the current backend.
