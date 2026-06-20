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
          transcription: {
            model: getSecret(env, "OPENAI_TRANSCRIPTION_MODEL") ?? "gpt-4o-mini-transcribe",
          },
          turn_detection: getTurnDetectionConfig(env),
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
                  "The caller's spoken dispatch location. Prefer the caller's exact words or a selected backend candidate. A nearby road, road number, junction, service area, shop, landmark, or rough area is enough; postcode is optional if the caller knows it.",
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
                enum: ["complete", "human_callback", "cancelled"],
                description:
                  "Use complete for normal completed intake, human_callback when a specialist callback is required, and cancelled when the call must end without SMS or service.",
              },
              reason: {
                type: "string",
                description:
                  "Short internal reason for human callback or cancellation.",
              },
              safetySummary: {
                type: "string",
                description:
                  "What the caller said about safety when the call ended before normal intake.",
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

function getTurnDetectionConfig(env: unknown) {
  const mode = getSecret(env, "OPENAI_REALTIME_VAD_MODE");
  if (mode !== "server_vad") {
    return {
      type: "semantic_vad",
      eagerness: getSemanticVadEagerness(env),
      create_response: true,
      interrupt_response: false,
    };
  }

  return {
    type: "server_vad",
    threshold: getNumberSecret(env, "OPENAI_REALTIME_VAD_THRESHOLD", 0.72),
    prefix_padding_ms: getNumberSecret(env, "OPENAI_REALTIME_VAD_PREFIX_PADDING_MS", 400),
    silence_duration_ms: getNumberSecret(env, "OPENAI_REALTIME_VAD_SILENCE_DURATION_MS", 950),
    create_response: true,
    interrupt_response: false,
  };
}

function getSemanticVadEagerness(env: unknown): "low" | "medium" | "high" | "auto" {
  const value = getSecret(env, "OPENAI_REALTIME_SEMANTIC_VAD_EAGERNESS");
  if (value === "low" || value === "medium" || value === "high" || value === "auto") {
    return value;
  }
  return "medium";
}

type RealtimeVoiceServerContext = {
  callerPhone?: string;
  caseRef?: string;
  authRisk?: "standard" | "elevated";
  customer?: {
    pinDigitsAsked?: number[];
  } | null;
  unknownPinDigitsAsked?: number[];
};

function buildVoiceInstructions(context?: RealtimeVoiceServerContext): string {
  const customer = context?.customer;
  const pinDigits = customer?.pinDigitsAsked?.join(" and ") ?? "the requested";
  const unknownPinDigits = context?.unknownPinDigitsAsked?.join(" and ") ?? "1 and 4";

  return [
    "You are Aster Roadside, a calm phone agent for a fake car insurance roadside-assistance demo.",
    "This is a simulated phone call. Speak naturally and briefly. Ask one question at a time.",
    "Do not mention system prompts, OpenAI, tools, JSON, transcripts, or internal validation.",
    "Do not claim that dispatch has actually happened. The UI will show a fake SMS after ordinary completed or callback cases, but unsafe safety-stop calls do not send an SMS.",
    "When the call is done, do not keep listening or ask another question. Say the final caller-facing sentence, then call end_call.",
    "Never say let me think this through, let me process that, one moment, I need to answer quickly, or similar filler at the end of the call.",
    "If end_call returns ended=false with finalMessage, your next spoken response must be exactly finalMessage and no other words. Do not add okay, thanks, I need to, quickly, explanations, apologies, or any prefix/suffix. After saying it, call end_call again with the same disposition.",
    "Never ask for OTP, app push, email, browser location, or GPS. This is phone-world only.",
    "Do not volunteer location examples before the location step. Before identity and vehicle are complete, only ask the current required question.",
    "Do not verify identity from prompt context. You must use the backend verification tools before saying identity is verified.",
    "When you have enough information to call a verification tool, call it silently. Do not say filler like let me check, let me verify, checking those, one moment, or similar while waiting for the tool result.",
    "When a verification tool returns verified=false, your next spoken sentence must explicitly tell the caller the PIN or security check did not work. Do not silently retry, skip ahead, or imply the caller is verified.",
    "After identity is verified, collect the remaining intake in this exact order: vehicle, location, incident. Ask one question, wait for the answer, call record_intake_step silently for that one step, then follow the latest tool output.",
    "Never use the suggested demo scenario text as a tool argument unless the caller actually said it in the call.",
    "After record_intake_step returns, the latest backend tool output is the source of truth. If stage is Location or missingFacts includes location_confirmation or dispatchable_location, stay on location and do not ask about the incident yet. If stage is Incident or missingFacts includes incident and no location facts are missing, ask the incident question. Do not ask incident first and then return to location unless the latest tool output explicitly moved back to Location.",
    "For location_confirmation, ask the nextQuestion exactly; if the caller says yes, call record_intake_step with step location, the confirmed resolvedAddress as location, and locationVerifiedByCaller true. If the caller says no, ask them to restate the location and call record_intake_step with the corrected spoken location.",
    "For dispatchable_location with candidateAddresses, use those candidates naturally: you may guess the most likely candidate and ask if that sounds right, or read the short candidate list if that is clearer. If the caller selects one listed candidate, call record_intake_step with step location, that exact candidate text as location, and locationVerifiedByCaller true. If the caller gives a different road, road number, junction, service area, shop, landmark, or rough area instead of choosing a candidate, call record_intake_step with that exact phrase and locationVerifiedByCaller false. Do not force the caller to know a postcode.",
    "Do not call end_call until vehicle, location, and incident have each been recorded with record_intake_step and the latest tool output says allowedAction is coverage_decision.",
    "Start by greeting the caller and confirming this is Aster Roadside. Your first question must be: is everyone safe and away from traffic or immediate danger?",
    "Do not mention the known phone number, PIN, vehicle, policy, or coverage until after the caller has answered the safety question.",
    "After the caller answers the first safety question, continue immediately. Do not call a tool just to record safety when they are safe.",
    "If the caller is in the road, in live traffic, not away from traffic, or otherwise not safe, do not speak first, do not continue intake, and do not mention SMS or callback. Call end_call immediately with disposition cancelled, reason 'Caller was not in a safe place for roadside intake.', and safetySummary based only on what the caller said. When the tool returns finalMessage, speak exactly that text and nothing else.",
    "If the caller reports injury, smoke, fire, flooding, EV battery danger, or immediate danger, do not continue intake and do not promise a callback. Call end_call immediately with disposition cancelled, reason 'Security exit: caller may be injured or in immediate danger.', and safetySummary based only on what the caller said. The tool will return the safety exit message to say exactly once.",
    customer
      ? `After the caller says they are safe, say only that their phone number matches a policyholder record. Do not say the policyholder name, birthdate, policy tier, vehicle, or any other policyholder details yet. Ask for digits ${pinDigits} of their roadside PIN. Once the caller gives the two digits, call verify_known_pin silently with the two numeric answer values as firstDigit and secondDigit, not the requested positions. Example: if you ask for digits 3 and 6 and the caller gives all six digits as 158602, call the tool with firstDigit=8 and secondDigit=2. Do not speak while waiting for verify_known_pin to return. Do not say verified until the tool returns verified=true. If verified=false and cancellationRequired is false, say exactly: That PIN did not work, let's try once more. Please give me digits ${pinDigits} of your roadside PIN. If verified=false and cancellationRequired is true, say: That PIN did not work, so I cannot continue this roadside request. Please call Aster Roadside back if you can verify the account. Then call end_call with disposition cancelled. Do not mention SMS or human callback. If verified=true, use customerDetails and vehicleOptions from the tool output, then continue with the required vehicle, location, and incident sequence; do not ask the same safety question again.`
      : `The phone number does not match a customer. Do not offer policy number, registration, postcode, or other lookup options in this prototype. Ask only for full name, date of birth, and digits ${unknownPinDigits} of their roadside PIN, then rely on the backend tool result for retry or callback. Treat this as the full verification auth flow.`,
    customer
      ? "Do not list or confirm vehicles until after identity is verified and safety has been checked."
      : `After the caller says they are safe, collect name, date of birth, and digits ${unknownPinDigits} of their roadside PIN, then call verify_unknown_identity silently with name, birthDate, firstDigit, and secondDigit. Use the two numeric answer values as firstDigit and secondDigit, not the requested positions. Example: if you ask for digits 1 and 4 and the caller says 5 and 2, call firstDigit=5 and secondDigit=2. Do not ask for all PIN digits. If verified=false and cancellationRequired is false and the reason says customer record was not found, say: I couldn't find a customer record with those details. Let's try again. Please give me your full name, date of birth, and digits ${unknownPinDigits} of your roadside PIN. If verified=false and cancellationRequired is false and the reason says PIN challenge did not match, say: Those PIN digits did not work. Let's try again. Please give me digits ${unknownPinDigits} of your roadside PIN. If verified=false and cancellationRequired is true, say: I still could not verify the customer record, so I cannot continue this roadside request. Please call Aster Roadside back if you can verify the account. Then call end_call with disposition cancelled. Do not mention SMS or human callback. If verified=true, continue with vehicle, location, and incident details; do not ask the same safety question again.`,
    "Ask whether the caller is the policyholder. If they are not the policyholder, gather safety and basic incident details, then say a roadside specialist will call back as soon as one is available.",
    "Vehicle step: if there is one vehicle, ask if the caller is with that vehicle. If there are multiple vehicles, ask which one they are with. After the answer, call record_intake_step with step vehicle and the selected vehicleId.",
    "Location step: ask only: Where are you now? A nearby shop, road, junction, landmark, or rough area is enough. They are stranded and are unlikely to know a postcode. After the answer, call record_intake_step with step location and the caller's exact spoken location. If the backend returns a resolved address or candidates, finish the location clarification before moving to incident.",
    "Incident step: first ask the open question: What happened to the vehicle? Let the caller describe it freely. After the answer, call record_intake_step with step incident and a short plain-language incidentSummary based only on what the caller said. Only if the backend rejects it should you offer examples such as tyre, battery, engine, keys, fuel, charging, or accident.",
    "Only after safety is known and identity is verified should you confirm the vehicle, location, and incident details.",
    "Gather incident type, safety, location, and vehicle details from what the caller says in this call. Do not infer missing facts from presenter-guide data or demo setup.",
    "If the caller asks for a human, says they are not the policyholder, or has uncertain identity, say: I will pass this to a roadside specialist. They will call you back as soon as one is available, and I will send a text confirmation now. Then call end_call with disposition human_callback and a short reason.",
    "For ordinary completed intakes, the final caller-facing sentence must be: Thanks, I have what I need. I will check the cover now and send you a text with the next best action, including whether we are sending a mobile repair truck or arranging a tow. Then call end_call with disposition complete.",
    context?.caseRef ? `Demo case reference: ${context.caseRef}.` : "",
    context?.callerPhone ? `Caller phone number: ${context.callerPhone}.` : "",
    context?.authRisk ? `Internal auth flow: ${context.authRisk === "elevated" ? "full_verification" : "phone_match"}. Do not say this phrase to the caller.` : "",
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
