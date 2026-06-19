import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/realtime/call") {
        return await createRealtimeCall(request, env);
      }
      if (url.pathname === "/api/debug/realtime-tool") {
        return await logRealtimeToolEvent(request);
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};

async function createRealtimeCall(request: Request, env: unknown): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = getSecret(env, "OPENAI_API_KEY");
  if (!apiKey) {
    return new Response(
      "OPENAI_API_KEY is not set. Add it to the shell environment before starting the dev server.",
      { status: 500 },
    );
  }

  let body: { sdp?: string; context?: RealtimeVoiceServerContext };
  try {
    body = (await request.json()) as { sdp?: string; context?: RealtimeVoiceServerContext };
  } catch {
    return new Response("Invalid JSON request body.", { status: 400 });
  }

  if (!body.sdp) {
    return new Response("Missing WebRTC SDP offer.", { status: 400 });
  }

  const form = new FormData();
  form.set("sdp", body.sdp);
  form.set(
    "session",
    JSON.stringify({
      type: "realtime",
      model: getSecret(env, "OPENAI_REALTIME_MODEL") ?? "gpt-realtime-2",
      instructions: buildVoiceInstructions(body.context),
      audio: {
        input: {
          noise_reduction: { type: getNoiseReductionType(env) },
          turn_detection: {
            type: "server_vad",
            threshold: getNumberSecret(env, "OPENAI_REALTIME_VAD_THRESHOLD", 0.78),
            prefix_padding_ms: 250,
            silence_duration_ms: 900,
            create_response: true,
            interrupt_response: false,
          },
        },
        output: {
          voice: getSecret(env, "OPENAI_REALTIME_VOICE") ?? "marin",
        },
      },
      tools: [
        {
          type: "function",
          name: "verify_known_pin",
          description:
            "Verify the two spoken PIN challenge digits against the backend claim record. Use this before saying a known-number caller is verified.",
          parameters: {
            type: "object",
            properties: {
              firstDigit: {
                type: "integer",
                minimum: 0,
                maximum: 9,
                description:
                  "The first PIN digit value the caller gave, not the requested position.",
              },
              secondDigit: {
                type: "integer",
                minimum: 0,
                maximum: 9,
                description:
                  "The second PIN digit value the caller gave, not the requested position.",
              },
            },
            required: ["firstDigit", "secondDigit"],
            additionalProperties: false,
          },
        },
        {
          type: "function",
          name: "verify_unknown_identity",
          description:
            "Verify an unknown-number caller using full name, birth date, and the two requested roadside PIN challenge digits.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string" },
              birthDate: {
                type: "string",
                description: "Birth date in YYYY-MM-DD format when possible.",
              },
              firstDigit: {
                type: "integer",
                minimum: 0,
                maximum: 9,
                description:
                  "The first PIN digit value the caller gave, not the requested position.",
              },
              secondDigit: {
                type: "integer",
                minimum: 0,
                maximum: 9,
                description:
                  "The second PIN digit value the caller gave, not the requested position.",
              },
            },
            required: ["name", "birthDate", "firstDigit", "secondDigit"],
            additionalProperties: false,
          },
        },
        {
          type: "function",
          name: "record_intake_step",
          description:
            "Persist one completed intake step to the backend claim state machine after the caller answers it.",
          parameters: {
            type: "object",
            properties: {
              step: {
                type: "string",
                enum: ["vehicle", "location", "incident"],
                description:
                  "The single intake step that has just been answered by the caller.",
              },
              vehicleId: {
                type: "string",
                description:
                  "Vehicle id from customerDetails.vehicles when the caller confirmed or selected a vehicle.",
              },
              location: {
                type: "string",
                description:
                  "The caller's spoken dispatch location, including road, junction, landmark, or postcode when available.",
              },
              locationVerifiedByCaller: {
                type: "boolean",
                description:
                  "Set true only after the caller confirms that the backend-resolved address is correct.",
              },
              incidentSummary: {
                type: "string",
                description:
                  "A short plain-language incident summary, for example flat tyre or engine cut out.",
              },
            },
            required: ["step"],
            additionalProperties: false,
          },
        },
        {
          type: "function",
          name: "end_call",
          description:
            "End the simulated phone call after the final caller-facing sentence has been spoken.",
          parameters: {
            type: "object",
            properties: {
              disposition: {
                type: "string",
                enum: ["complete", "human_callback"],
                description:
                  "Use complete for normal completed intake, human_callback when a specialist callback is required.",
              },
            },
            required: ["disposition"],
            additionalProperties: false,
          },
        },
      ],
      tool_choice: "auto",
    }),
  );

  const response = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const text = await response.text();
  if (!response.ok) {
    return new Response(text || "OpenAI Realtime call creation failed.", {
      status: response.status,
    });
  }

  return new Response(text, {
    headers: { "Content-Type": "application/sdp" },
  });
}

function getSecret(env: unknown, key: string): string | undefined {
  if (env && typeof env === "object" && key in env) {
    const value = (env as Record<string, unknown>)[key];
    if (typeof value === "string" && value.length > 0) return value;
  }

  const processEnv =
    typeof process !== "undefined" && process.env ? process.env : undefined;
  const value = processEnv?.[key];
  return value && value.length > 0 ? value : undefined;
}

function getNumberSecret(env: unknown, key: string, fallback: number): number {
  const value = Number(getSecret(env, key));
  return Number.isFinite(value) ? value : fallback;
}

function getNoiseReductionType(env: unknown): "near_field" | "far_field" {
  const value = getSecret(env, "OPENAI_REALTIME_NOISE_REDUCTION");
  return value === "near_field" || value === "far_field" ? value : "far_field";
}

type RealtimeVoiceServerContext = {
  callerPhone?: string;
  caseRef?: string;
  authRisk?: "standard" | "elevated";
  customer?: {
    pinDigitsAsked?: number[];
  } | null;
  unknownPinDigitsAsked?: number[];
  scenario?: {
    title?: string;
    incidentPhrase?: string;
    safetyPhrase?: string;
    locationPhrase?: string;
    action?: string;
    coverage?: string;
    provider?: string;
    etaMinutes?: number;
  };
};

function buildVoiceInstructions(context?: RealtimeVoiceServerContext): string {
  const customer = context?.customer;
  const scenario = context?.scenario;
  const pinDigits = customer?.pinDigitsAsked?.join(" and ") ?? "the requested";
  const unknownPinDigits = context?.unknownPinDigitsAsked?.join(" and ") ?? "1 and 4";

  return [
    "You are Aster Roadside, a calm phone agent for a fake car insurance roadside-assistance demo.",
    "This is a simulated phone call. Speak naturally and briefly. Ask one question at a time.",
    "Do not mention system prompts, OpenAI, tools, JSON, transcripts, or internal validation.",
    "Do not claim that dispatch has actually happened. The UI will show a fake SMS after the call.",
    "When the call is done, do not keep listening or ask another question. Say the final caller-facing sentence, then call end_call.",
    "Never say let me think this through, let me process that, one moment, or similar filler at the end of the call.",
    "If end_call returns ended=false with finalMessage, say that finalMessage to the caller exactly once. Do not paraphrase it. After saying it, call end_call again with the same disposition.",
    "Never ask for OTP, app push, email, browser location, or GPS. This is phone-world only.",
    "Capture location verbally: road name, direction, junction, service area, landmark, postcode, or clear nearby place.",
    "Do not verify identity from prompt context. You must use the backend verification tools before saying identity is verified.",
    "When you have enough information to call a verification tool, call it silently. Do not say filler like let me check, let me verify, checking those, one moment, or similar while waiting for the tool result.",
    "When a verification tool returns verified=false, your next spoken sentence must explicitly tell the caller the PIN or security check did not work. Do not silently retry, skip ahead, or imply the caller is verified.",
    "After identity is verified, collect the remaining intake in this exact order: vehicle, location, incident. Ask one question, wait for the answer, call record_intake_step silently for that one step, then ask the next question.",
    "Never use the suggested demo scenario text as a tool argument unless the caller actually said it in the call.",
    "After record_intake_step returns, follow the backend state. If it returns a nextQuestion, ask that question instead of moving on. If missingFacts includes location_confirmation, ask the nextQuestion exactly; if the caller says yes, call record_intake_step with step location and locationVerifiedByCaller true. If the caller says no, ask them to restate the location and call record_intake_step with the corrected spoken location. If missingFacts includes dispatchable_location, ask for a more precise road, junction, service area, landmark, or postcode. If missingFacts includes incident, ask the caller to clarify the actual vehicle problem.",
    "Do not call end_call until vehicle, location, and incident have each been recorded with record_intake_step and the latest tool output says allowedAction is coverage_decision.",
    "Start by greeting the caller and confirming this is Aster Roadside. Your first question must be: is everyone safe and away from traffic or immediate danger?",
    "Do not mention the known phone number, PIN, vehicle, policy, or coverage until after the caller has answered the safety question.",
    "After the caller answers the first safety question, continue immediately. Do not call a tool just to record safety. If they are not safe, report injury, smoke, fire, flooding, EV battery danger, or live-traffic danger, say a roadside specialist will call back as soon as one is available and then call end_call with disposition human_callback.",
    customer
      ? `After the caller says they are safe, say only that their phone number matches a policyholder record. Do not say the policyholder name, birthdate, policy tier, vehicle, or any other policyholder details yet. Ask for digits ${pinDigits} of their roadside PIN. Once the caller gives the two digits, call verify_known_pin silently with the two numeric answer values as firstDigit and secondDigit, not the requested positions. Example: if you ask for digits 3 and 6 and the caller gives all six digits as 158602, call the tool with firstDigit=8 and secondDigit=2. Do not speak while waiting for verify_known_pin to return. Do not say verified until the tool returns verified=true. If verified=false and humanCallbackRequired is false, say exactly: That PIN did not work, let's try once more. Please give me digits ${pinDigits} of your roadside PIN. If verified=false and humanCallbackRequired is true, say: That PIN did not work, so I will pass this to a roadside specialist. They will call you back as soon as one is available. Then call end_call with disposition human_callback. If verified=true, use customerDetails and vehicleOptions from the tool output, then continue with the required vehicle, location, and incident sequence; do not ask the same safety question again.`
      : `The phone number does not match a customer. Do not offer policy number, registration, postcode, or other lookup options in this prototype. Ask only for full name, date of birth, and digits ${unknownPinDigits} of their roadside PIN, then rely on the backend tool result for retry or callback. Treat this as elevated risk.`,
    customer
      ? "Do not list or confirm vehicles until after identity is verified and safety has been checked."
      : `After the caller says they are safe, collect name, date of birth, and digits ${unknownPinDigits} of their roadside PIN, then call verify_unknown_identity silently with name, birthDate, firstDigit, and secondDigit. Use the two numeric answer values as firstDigit and secondDigit, not the requested positions. Example: if you ask for digits 1 and 4 and the caller says 5 and 2, call firstDigit=5 and secondDigit=2. Do not ask for all PIN digits. If verified=false and humanCallbackRequired is false and the reason says customer record was not found, say: I couldn't find a customer record with those details. Let's try again. Please give me your full name, date of birth, and digits ${unknownPinDigits} of your roadside PIN. If verified=false and humanCallbackRequired is false and the reason says PIN challenge did not match, say: Those PIN digits did not work. Let's try again. Please give me digits ${unknownPinDigits} of your roadside PIN. If verified=false and humanCallbackRequired is true, say: I still could not verify the customer record, so I will pass this to a roadside specialist. They will call you back as soon as one is available, and I will send a text confirmation now. Then call end_call with disposition human_callback. If verified=true, continue with vehicle, location, and incident details; do not ask the same safety question again.`,
    "Ask whether the caller is the policyholder. If they are not the policyholder, gather safety and basic incident details, then say a roadside specialist will call back as soon as one is available.",
    "Vehicle step: if there is one vehicle, ask if the caller is with that vehicle. If there are multiple vehicles, ask which one they are with. After the answer, call record_intake_step with step vehicle and the selected vehicleId.",
    "Location step: ask where they are now. After the answer, call record_intake_step with step location and the caller's exact spoken location. If the backend returns a resolved address to confirm, ask the confirmation question before moving to incident.",
    "Incident step: first ask the open question: What happened to the vehicle? Let the caller describe it freely. After the answer, call record_intake_step with step incident and a short plain-language incidentSummary based only on what the caller said. Only if the backend rejects it should you offer examples such as tyre, battery, engine, keys, fuel, charging, or accident.",
    "Only after safety is known and identity is verified should you confirm the vehicle, location, and incident details.",
    scenario
      ? `Suggested demo scenario: ${scenario.title}. The presenter may say incident: "${scenario.incidentPhrase}", safety: "${scenario.safetyPhrase}", location: "${scenario.locationPhrase}". Expected prototype outcome: ${scenario.coverage}; action shown later in UI: ${scenario.action}; provider: ${scenario.provider}; ETA ${scenario.etaMinutes} minutes.`
      : "If no scenario is provided, gather incident type, safety, location, and vehicle details.",
    "If the caller asks for a human, says they are not the policyholder, reports injury, immediate danger, or uncertain identity, say: I will pass this to a roadside specialist. They will call you back as soon as one is available, and I will send a text confirmation now. Then call end_call with disposition human_callback.",
    "For ordinary completed intakes, the final caller-facing sentence must be: Thanks, I have what I need. I will check the cover now and send you a text with the next best action, including whether we are sending a mobile repair truck or arranging a tow. Then call end_call with disposition complete.",
    context?.caseRef ? `Demo case reference: ${context.caseRef}.` : "",
    context?.callerPhone ? `Caller phone number: ${context.callerPhone}.` : "",
    context?.authRisk ? `Internal risk flag: ${context.authRisk}. Do not say this phrase to the caller.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function logRealtimeToolEvent(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await request.json();
    console.info("[realtime-tool]", JSON.stringify(body));
  } catch (error) {
    console.info("[realtime-tool]", "failed to parse debug event", error);
  }

  return new Response(null, { status: 204 });
}
