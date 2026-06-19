# Aster Roadside Assist

Prototype insurance roadside-assistance voice agent for the case study.

## What It Demonstrates

- Phone-first roadside intake through a browser-simulated voice call.
- Kotlin / Spring Boot backend owning customer lookup, PIN checks, location validation, incident classification, coverage, and next-best action.
- OpenAI Realtime for the voice experience.
- Backend OpenAI structured-output classification for incident enum resolution.
- Fake customer, policy, and vehicle data for demo use.
- Fake SMS outcome after the call.

## Local Run

Backend:

```bash
cd code/backend
OPENAI_API_KEY=... GOOGLE_MAPS_API_KEY=... ./gradlew bootRun
```

Frontend:

```bash
cd code/frontend
OPENAI_API_KEY=... npm run dev -- --host 127.0.0.1 --port 8080
```

Open the app at `http://127.0.0.1:8080`.

## Demo Credentials

Unknown-number fallback demo:

- Name: Alex Carter
- Birthdate: 1988-02-19
- PIN challenge: digits 1 and 4 are `5` and `2`

## Docs

- [Architecture](ARCHITECTURE.md)
- [Client Spec](CLIENT_SPEC.md)
- [Milestones](MILESTONES.md)
- [Agent Observation UI Spec](AGENT_OBSERVATION_UI_SPEC.md)
