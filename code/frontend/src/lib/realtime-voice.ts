import type { Customer, Scenario, Vehicle } from "@/lib/roadside-data";
import {
  getBackendNextStep,
  updateBackendFacts,
  verifyKnownPin,
  verifyUnknownIdentity,
  type ClaimSession,
} from "@/lib/backend-api";

export type RealtimeVoiceContext = {
  callerPhone: string;
  customer: Customer | null;
  selectedVehicle: Vehicle | null;
  scenario: Scenario;
  caseRef: string;
  authRisk: "standard" | "elevated";
};

export type RealtimeVoiceSession = {
  close: () => void;
};

export type RealtimeVoiceDoneDisposition = "complete" | "human_callback";

export type RealtimeVoiceCallbacks = {
  onDone?: (
    disposition: RealtimeVoiceDoneDisposition,
    reason?: string,
  ) => void | Promise<void>;
};

export async function startRealtimeVoiceSession(
  context: RealtimeVoiceContext,
  callbacks: RealtimeVoiceCallbacks = {},
): Promise<RealtimeVoiceSession> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone capture is not available in this browser.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
      channelCount: 1,
    },
  });

  const pc = new RTCPeerConnection();
  const remoteAudio = new Audio();
  remoteAudio.autoplay = true;
  const handledToolCalls = new Set<string>();
  const pendingToolNames = new Map<string, string>();
  const pendingToolArguments = new Map<string, string>();
  const completionState: CompletionState = {
    finalMessageIssued: false,
    finalMessageSpoken: false,
  };
  let closed = false;
  const closeSession = () => {
    if (closed) return;
    closed = true;
    closeRealtimeResources(pc, stream, remoteAudio);
  };

  pc.ontrack = (event) => {
    const [remoteStream] = event.streams;
    if (remoteStream) {
      remoteAudio.srcObject = remoteStream;
    }
  };

  stream.getTracks().forEach((track) => pc.addTrack(track, stream));
  const dataChannel = pc.createDataChannel("oai-events");
  dataChannel.onopen = () => {
    dataChannel.send(JSON.stringify({ type: "response.create" }));
  };
  dataChannel.onmessage = (event) => {
    void handleRealtimeServerEvent(
      event.data,
      dataChannel,
      context,
      handledToolCalls,
      pendingToolNames,
      pendingToolArguments,
      completionState,
      closeSession,
      callbacks,
    );
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  let response: Response;
  try {
    response = await fetch("/api/realtime/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sdp: offer.sdp,
        context: serializeContext(context),
      }),
    });
  } catch (error) {
    closeSession();
    throw new Error(
      error instanceof TypeError
        ? "Could not reach the local Realtime endpoint. Make sure the dev server is running."
        : "Realtime voice request failed before reaching the server.",
    );
  }

  if (!response.ok) {
    const message = await response.text();
    closeSession();
    throw new Error(message || "Realtime voice session failed to start.");
  }

  const answer = {
    type: "answer" as RTCSdpType,
    sdp: await response.text(),
  };
  await pc.setRemoteDescription(answer);

  return {
    close: closeSession,
  };
}

function serializeContext(context: RealtimeVoiceContext) {
  return {
    callerPhone: context.callerPhone,
    caseRef: context.caseRef,
    authRisk: context.authRisk,
    customer: context.customer
      ? {
          pinDigitsAsked: context.customer.pinDigitsAsked,
        }
      : null,
    unknownPinDigitsAsked: [1, 4],
    scenario: {
      id: context.scenario.id,
      title: context.scenario.title,
      incidentPhrase: context.scenario.incidentPhrase,
      safetyPhrase: context.scenario.safetyPhrase,
      locationPhrase: context.scenario.locationPhrase,
      action: context.scenario.action,
      coverage: context.scenario.coverage,
      provider: context.scenario.provider,
      etaMinutes: context.scenario.etaMinutes,
    },
  };
}

type RealtimeFunctionCall = {
  type?: string;
  role?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  delta?: string;
  transcript?: string;
  text?: string;
};

type CompletionState = {
  finalMessageIssued: boolean;
  finalMessageSpoken: boolean;
  spokenDisposition?: RealtimeVoiceDoneDisposition;
  spokenReason?: string;
  lastAssistantTranscript?: string;
  pendingClose?: {
    disposition: RealtimeVoiceDoneDisposition;
    reason?: string;
    doneNotified: boolean;
  };
  closeTimer?: number;
};

async function handleRealtimeServerEvent(
  rawEvent: string,
  dataChannel: RTCDataChannel,
  context: RealtimeVoiceContext,
  handledToolCalls: Set<string>,
  pendingToolNames: Map<string, string>,
  pendingToolArguments: Map<string, string>,
  completionState: CompletionState,
  closeSession: () => void,
  callbacks: RealtimeVoiceCallbacks,
) {
  let event: RealtimeFunctionCall & {
    item?: RealtimeFunctionCall;
  };

  try {
    event = JSON.parse(rawEvent) as typeof event;
  } catch {
    return;
  }

  const item = event.item ?? event;
  captureAssistantTranscript(event, item, completionState);
  maybeCloseAfterAudioDone(event, completionState, closeSession, callbacks);
  maybeCloseAfterSpokenFinal(event, completionState, closeSession, callbacks);

  const callIdForEvent = item.call_id ?? event.call_id;
  if (item.type === "function_call" && callIdForEvent && item.name) {
    pendingToolNames.set(callIdForEvent, item.name);
  }

  if (event.type === "response.function_call_arguments.delta" && callIdForEvent) {
    pendingToolArguments.set(
      callIdForEvent,
      `${pendingToolArguments.get(callIdForEvent) ?? ""}${event.delta ?? ""}`,
    );
    return;
  }

  const isDoneEvent =
    event.type === "response.function_call_arguments.done" ||
    (event.type === "response.output_item.done" && item.type === "function_call");
  if (!isDoneEvent) return;

  const callId = callIdForEvent;
  const name = item.name ?? event.name ?? (callId ? pendingToolNames.get(callId) : undefined);
  const argsText =
    firstNonEmpty(item.arguments, event.arguments, callId ? pendingToolArguments.get(callId) : undefined) ??
    "{}";
  if (!name || !callId || handledToolCalls.has(callId)) return;
  if (name !== "end_call" && argsText.trim() === "{}") {
    logRealtimeTool("waiting_for_arguments", { name, callId });
    return;
  }

  handledToolCalls.add(callId);
  pendingToolNames.delete(callId);
  pendingToolArguments.delete(callId);
  logRealtimeTool("call", { name, callId, arguments: argsText });

  let output: unknown;
  try {
    const args = JSON.parse(argsText) as Record<string, unknown>;
    if (name === "verify_known_pin") {
      output = await verifyKnownPin(context.caseRef, {
        firstDigit: Number(args.firstDigit),
        secondDigit: Number(args.secondDigit),
      });
    } else if (name === "verify_unknown_identity") {
      output = await verifyUnknownIdentity(context.caseRef, {
        name: String(args.name ?? ""),
        birthDate: String(args.birthDate ?? ""),
        firstDigit: Number(args.firstDigit),
        secondDigit: Number(args.secondDigit),
      });
    } else if (name === "record_intake_step") {
      const updatedClaim = await updateBackendFacts(
        context.caseRef,
        factsForRecordedStep(args),
      );
      output = summarizeClaimForAgent(updatedClaim);
    } else if (name === "end_call") {
      const disposition =
        args.disposition === "human_callback" ? "human_callback" : "complete";
      const callbackReason = nonEmptyString(args.reason);
      const safetySummary = nonEmptyString(args.safetySummary);
      if (disposition === "complete") {
        const nextStep = await getBackendNextStep(context.caseRef);
        if (nextStep.allowedAction !== "coverage_decision") {
          output = {
            ended: false,
            disposition: "continue",
            allowedAction: nextStep.allowedAction,
            nextQuestion: nextStep.question,
            reason: `Backend intake is incomplete: ${nextStep.reason}`,
            blockedActions: nextStep.blockedActions,
          };
          logRealtimeTool("output", { name, callId, output });
          sendFunctionOutput(dataChannel, callId, output);
          dataChannel.send(JSON.stringify({ type: "response.create" }));
          return;
        }
        if (!completionState.finalMessageIssued) {
          completionState.finalMessageIssued = true;
          output = {
            ended: false,
            disposition: "continue",
            finalMessage:
              "Thanks, I have what I need. I will check the cover now and send you a text with the next best action, including whether we are sending a mobile repair truck or arranging a tow.",
          };
          logRealtimeTool("output", { name, callId, output });
          sendFunctionOutput(dataChannel, callId, output);
          dataChannel.send(JSON.stringify({ type: "response.create" }));
          return;
        }
        if (!completionState.finalMessageSpoken) {
          output = {
            ended: false,
            disposition: "continue",
            finalMessage:
              "Thanks, I have what I need. I will check the cover now and send you a text with the next best action, including whether we are sending a mobile repair truck or arranging a tow.",
            reason:
              "The final caller-facing SMS and next-best-action message has not been spoken yet. Say the finalMessage before calling end_call again.",
            lastAssistantTranscript: completionState.lastAssistantTranscript,
          };
          logRealtimeTool("output", { name, callId, output });
          sendFunctionOutput(dataChannel, callId, output);
          dataChannel.send(JSON.stringify({ type: "response.create" }));
          return;
        }
      }
      if (disposition === "human_callback" && safetySummary) {
        await updateBackendFacts(context.caseRef, {
          safetyKnown: false,
          safetySummary,
        });
      }
      if (disposition === "human_callback") {
        const finalMessage = humanCallbackFinalMessage(callbackReason, safetySummary);
        const finalReason =
          callbackReason ??
          (isUnsafeSafetyCallback(callbackReason, safetySummary)
            ? "Caller was not in a safe place for roadside intake."
            : "AI agent routed the case to a human callback.");
        if (!completionState.finalMessageIssued) {
          completionState.finalMessageIssued = true;
          completionState.spokenReason = finalReason;
          output = {
            ended: false,
            disposition: "continue",
            finalMessage,
            reason:
              "Say finalMessage to the caller before ending the call. Then call end_call again with the same disposition and reason.",
          };
          logRealtimeTool("output", { name, callId, output });
          sendFunctionOutput(dataChannel, callId, output);
          dataChannel.send(JSON.stringify({ type: "response.create" }));
          return;
        }
        if (!completionState.finalMessageSpoken) {
          completionState.spokenReason = finalReason;
          output = {
            ended: false,
            disposition: "continue",
            finalMessage,
            reason:
              "The final caller-facing message has not been spoken yet. Say finalMessage before calling end_call again.",
            lastAssistantTranscript: completionState.lastAssistantTranscript,
          };
          logRealtimeTool("output", { name, callId, output });
          sendFunctionOutput(dataChannel, callId, output);
          dataChannel.send(JSON.stringify({ type: "response.create" }));
          return;
        }
      }
      output = { ended: true, disposition, reason: callbackReason };
      logRealtimeTool("output", { name, callId, output });
      sendFunctionOutput(dataChannel, callId, output);
      completionState.pendingClose = {
        disposition,
        reason: callbackReason,
        doneNotified: false,
      };
      completionState.closeTimer = window.setTimeout(() => {
        finishRealtimeCall(completionState, closeSession, callbacks);
      }, 6_000);
      return;
    } else {
      output = { verified: false, reason: `Unknown tool: ${name}` };
    }
  } catch (error) {
    output = {
      verified: false,
      reason: error instanceof Error ? error.message : "Backend verification failed.",
    };
  }

  if (dataChannel.readyState !== "open") return;
  logRealtimeTool("output", { name, callId, output: summarizeToolOutput(output) });
  sendFunctionOutput(dataChannel, callId, output);
  dataChannel.send(JSON.stringify({ type: "response.create" }));
}

function maybeCloseAfterAudioDone(
  event: RealtimeFunctionCall,
  completionState: CompletionState,
  closeSession: () => void,
  callbacks: RealtimeVoiceCallbacks,
) {
  if (!completionState.pendingClose) return;
  const type = event.type ?? "";
  if (
    type === "response.audio.done" ||
    type === "response.output_audio.done"
  ) {
    if (completionState.closeTimer) {
      window.clearTimeout(completionState.closeTimer);
      completionState.closeTimer = undefined;
    }
    completionState.closeTimer = window.setTimeout(() => {
      finishRealtimeCall(completionState, closeSession, callbacks);
    }, 1_000);
  }
}

function maybeCloseAfterSpokenFinal(
  event: RealtimeFunctionCall,
  completionState: CompletionState,
  closeSession: () => void,
  callbacks: RealtimeVoiceCallbacks,
) {
  if (
    !completionState.finalMessageSpoken ||
    !completionState.spokenDisposition ||
    completionState.pendingClose?.doneNotified
  ) {
    return;
  }

  completionState.pendingClose ??= {
    disposition: completionState.spokenDisposition,
    reason: completionState.spokenReason,
    doneNotified: false,
  };

  const delayMs = isRealtimeDoneEvent(event.type) ? 1_000 : 4_000;
  if (completionState.closeTimer) {
    window.clearTimeout(completionState.closeTimer);
  }
  completionState.closeTimer = window.setTimeout(() => {
    finishRealtimeCall(completionState, closeSession, callbacks);
  }, delayMs);
}

function isRealtimeDoneEvent(type?: string) {
  return (
    type === "response.audio.done" ||
    type === "response.output_audio.done" ||
    type === "response.audio_transcript.done" ||
    type === "response.output_item.done" ||
    type === "response.done"
  );
}

function finishRealtimeCall(
  completionState: CompletionState,
  closeSession: () => void,
  callbacks: RealtimeVoiceCallbacks,
) {
  const pendingClose = completionState.pendingClose;
  if (!pendingClose || pendingClose.doneNotified) return;
  pendingClose.doneNotified = true;
  if (completionState.closeTimer) {
    window.clearTimeout(completionState.closeTimer);
    completionState.closeTimer = undefined;
  }
  closeSession();
  void callbacks.onDone?.(pendingClose.disposition, pendingClose.reason);
}

function firstNonEmpty(...values: Array<string | undefined>) {
  return values.find((value) => value !== undefined && value.trim().length > 0);
}

function humanCallbackFinalMessage(reason?: string, safetySummary?: string) {
  if (isUnsafeSafetyCallback(reason, safetySummary)) {
    return "Please get to a safe place away from traffic now. If anyone is injured or you cannot get safe, call emergency services immediately. Once you are safe, call Aster Roadside back and we will continue. I am ending this call so you can focus on safety.";
  }

  return "I will pass this to a roadside specialist. They will call you back as soon as one is available, and I will send a text confirmation now.";
}

function isUnsafeSafetyCallback(reason?: string, safetySummary?: string) {
  const text = `${reason ?? ""} ${safetySummary ?? ""}`.toLowerCase();
  return (
    text.includes("safe place") ||
    text.includes("not safe") ||
    text.includes("unsafe") ||
    text.includes("safety risk") ||
    text.includes("middle of the road") ||
    text.includes("in the road") ||
    text.includes("traffic")
  );
}

function captureAssistantTranscript(
  event: RealtimeFunctionCall,
  item: RealtimeFunctionCall,
  completionState: CompletionState,
) {
  const eventType = event.type ?? "";
  if (!eventType.startsWith("response.") && item.role !== "assistant") return;

  const transcript = firstNonEmpty(event.transcript, item.transcript, event.text, item.text);
  if (!transcript) return;

  completionState.lastAssistantTranscript = transcript;
  const normalized = transcript.toLowerCase();
  if (
    normalized.includes("thanks") &&
    (normalized.includes("text") || normalized.includes("sms")) &&
    normalized.includes("next best action")
  ) {
    completionState.finalMessageSpoken = true;
    completionState.spokenDisposition = "complete";
  }
  if (
    normalized.includes("roadside specialist") &&
    normalized.includes("call you back") &&
    (normalized.includes("text") || normalized.includes("sms"))
  ) {
    completionState.finalMessageSpoken = true;
    completionState.spokenDisposition = "human_callback";
    completionState.spokenReason = "AI agent routed the case to a human callback.";
  }
  if (
    normalized.includes("safe place") &&
    normalized.includes("call") &&
    normalized.includes("back") &&
    (normalized.includes("traffic") || normalized.includes("emergency services"))
  ) {
    completionState.finalMessageSpoken = true;
    completionState.spokenDisposition = "human_callback";
    completionState.spokenReason = "Caller was not in a safe place for roadside intake.";
  }
}

function factsForRecordedStep(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const step = String(args.step ?? "");

  if (step === "vehicle") {
    return {
      vehicleConfirmed: true,
      selectedVehicleId: nonEmptyString(args.vehicleId),
    };
  }

  if (step === "location") {
    return {
      locationConfirmed: true,
      location: nonEmptyString(args.location),
      locationVerifiedByCaller: args.locationVerifiedByCaller === true,
    };
  }

  if (step === "incident") {
    return {
      incidentKnown: true,
      incidentSummary: nonEmptyString(args.incidentSummary),
    };
  }

  return {};
}

function summarizeClaimForAgent(claim: ClaimSession) {
  return {
    recorded: true,
    status: claim.status,
    stage: claim.stage,
    allowedAction: claim.stateEvaluation?.allowedAction,
    nextQuestion: claim.stateEvaluation?.question,
    reason: claim.stateEvaluation?.reason,
    missingFacts: claim.missingFacts,
    blockedActions: claim.blockedActions,
    locationDispatchable: claim.locationResolution?.dispatchable,
    resolvedArea: claim.locationResolution?.normalizedArea,
    identityConfirmed: claim.intakeFacts.identityConfirmed,
    vehicleConfirmed: claim.intakeFacts.vehicleConfirmed,
    locationConfirmed: claim.intakeFacts.locationConfirmed,
    incidentKnown: claim.intakeFacts.incidentKnown,
    recordedLocation: claim.intakeFacts.location,
    resolvedAddress: claim.locationResolution?.formattedAddress,
    candidateAddresses: claim.locationResolution?.candidateAddresses,
    locationRequiresConfirmation: claim.locationResolution?.requiresCallerConfirmation,
    locationSource: claim.locationResolution?.source,
    recordedIncident: claim.intakeFacts.incidentSummary,
    classifiedIncident: claim.intakeFacts.issueType,
  };
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function summarizeToolOutput(output: unknown) {
  if (!output || typeof output !== "object") return output;
  const record = output as Record<string, unknown>;
  return {
    recorded: record.recorded,
    verified: record.verified,
    ended: record.ended,
    disposition: record.disposition,
    status: record.status,
    stage: record.stage,
    allowedAction: record.allowedAction,
    nextQuestion: record.nextQuestion,
    finalMessage: record.finalMessage,
    reason: record.reason,
    attemptsRemaining: record.attemptsRemaining,
    humanCallbackRequired: record.humanCallbackRequired,
    nextAction:
      typeof record.nextStep === "object" && record.nextStep
        ? (record.nextStep as Record<string, unknown>).allowedAction
        : undefined,
    vehicleOptionCount: Array.isArray(record.vehicleOptions)
      ? record.vehicleOptions.length
      : undefined,
    hasPolicyholderName: Boolean(record.policyholderName),
    hasCustomerDetails: Boolean(record.customerDetails),
  };
}

function logRealtimeTool(event: string, payload: Record<string, unknown>) {
  console.info("[realtime-tool]", event, payload);
  void fetch("/api/debug/realtime-tool", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event, ...payload }),
  }).catch(() => undefined);
}

function sendFunctionOutput(
  dataChannel: RTCDataChannel,
  callId: string,
  output: unknown,
) {
  if (dataChannel.readyState !== "open") return;
  dataChannel.send(
    JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(output),
      },
    }),
  );
}

function closeRealtimeResources(
  pc: RTCPeerConnection,
  stream: MediaStream,
  remoteAudio: HTMLAudioElement,
) {
  stream.getTracks().forEach((track) => track.stop());
  remoteAudio.pause();
  remoteAudio.srcObject = null;
  pc.getSenders().forEach((sender) => sender.track?.stop());
  pc.close();
}
