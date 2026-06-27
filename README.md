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

Observer:

```bash
cd code/observer
npm run dev -- --host 127.0.0.1 --port 8082
```

Open the caller simulator at the frontend URL printed by Vite, and open the human
observation console at the observer URL printed by Vite. The backend accepts local
browser origins on any localhost port so the apps can move if a port is already in use.

## Demo Loom

A demo of the product is available on [loom](https://www.loom.com/share/9cf19a8026aa4de7b06cbfaa306837ee)

## Docs

- [PRD](PRD.md)
- [Architecture](ARCHITECTURE.md)
- [Client Spec](CLIENT_SPEC.md)
- [Milestones](MILESTONES.md)
- [Agent Observation UI Spec](AGENT_OBSERVATION_UI_SPEC.md)
