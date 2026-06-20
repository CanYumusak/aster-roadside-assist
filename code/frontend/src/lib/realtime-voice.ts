import type { Customer, Vehicle } from "@/lib/roadside-data";
import {
  appendBackendToolCall,
  appendBackendTranscript,
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
  caseRef: string;
  authRisk: "standard" | "elevated";
};

export type RealtimeVoiceSession = {
  close: () => void;
};

export type RealtimeVoiceDoneDisposition = "complete" | "human_callback" | "cancelled";

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
  const runtime = createRealtimeRuntime();
  let closed = false;
  const closeSession = () => {
    if (closed) return;
    closed = true;
    clearPendingInterruption(runtime.interruption);
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
    requestModelResponse(dataChannel);
  };
  dataChannel.onmessage = (event) => {
    void handleRealtimeServerEvent(
      event.data,
      dataChannel,
      context,
      runtime,
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
  item_id?: string;
  response_id?: string;
  output_index?: number;
  content_index?: number;
  audio_start_ms?: number;
  audio_end_ms?: number;
};

type CompletedToolCall = {
  name: string;
  callId: string;
  argsText: string;
};

class ToolCallBuffer {
  private readonly handled = new Set<string>();
  private readonly pendingNames = new Map<string, string>();
  private readonly pendingArguments = new Map<string, string>();

  rememberName(callId: string | undefined, name: string | undefined) {
    if (callId && name) this.pendingNames.set(callId, name);
  }

  appendArguments(
    callId: string | undefined,
    delta: string | undefined,
  ) {
    if (!callId) return;
    this.pendingArguments.set(
      callId,
      `${this.pendingArguments.get(callId) ?? ""}${delta ?? ""}`,
    );
  }

  consumeCompleted(
    event: RealtimeFunctionCall,
    item: RealtimeFunctionCall,
  ): CompletedToolCall | null {
    const callId = item.call_id ?? event.call_id;
    const name = item.name ?? event.name ?? (callId ? this.pendingNames.get(callId) : undefined);
    const argsText =
      firstNonEmpty(item.arguments, event.arguments, callId ? this.pendingArguments.get(callId) : undefined) ??
      "{}";

    if (!name || !callId || this.handled.has(callId)) return null;
    if (name !== "end_call" && argsText.trim() === "{}") {
      logRealtimeTool("waiting_for_arguments", { name, callId });
      return null;
    }

    this.handled.add(callId);
    this.pendingNames.delete(callId);
    this.pendingArguments.delete(callId);
    return { name, callId, argsText };
  }
}

type TranscriptState = {
  assistantDeltas: Map<string, string>;
  callerDeltas: Map<string, string>;
  seen: Set<string>;
  lastCallerTranscriptAt: number;
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
  outputAudioBufferStopped: boolean;
  outputAudioBufferCleared: boolean;
};

type PendingInterruption = {
  itemId?: string;
  serverStartMs?: number;
  localStartedAt: number;
  transcript?: string;
  timer?: number;
  confirmed: boolean;
};

type InterruptionState = {
  assistantSpeaking: boolean;
  lastConfirmedAt: number;
  pending?: PendingInterruption;
};

type RealtimeRuntime = {
  tools: ToolCallBuffer;
  transcript: TranscriptState;
  completion: CompletionState;
  interruption: InterruptionState;
};

const BARGE_IN_CONFIRMATION_MS = 450;
const MIN_BARGE_IN_DURATION_MS = 500;
const INTERRUPTION_COOLDOWN_MS = 1_200;
const SHORT_FILLERS = new Set([
  "hm",
  "hmm",
  "mm",
  "mmm",
  "um",
  "umm",
  "uh",
  "uhh",
  "er",
  "erm",
  "okay",
  "ok",
  "yeah",
  "yep",
]);
const EXPLICIT_INTERRUPT_PATTERNS = [
  /\bstop\b/i,
  /\bwait\b/i,
  /\bhold on\b/i,
  /\bhang on\b/i,
  /\bno\b/i,
  /\bthat's wrong\b/i,
  /\bnot right\b/i,
];
const SECURITY_EXIT_MESSAGE =
  "If anyone may be injured or in immediate danger, call emergency services now. Move to a safe place if you can. We cannot continue roadside intake until everyone is safe.";
const SECURITY_EXIT_REASON = "Security exit: caller may be injured or in immediate danger.";
const COMPLETE_FINAL_MESSAGE =
  "Thanks, I have what I need. I will check the cover now and send you a text with the next best action, including whether we are sending a mobile repair truck or arranging a tow.";

function createRealtimeRuntime(): RealtimeRuntime {
  return {
    tools: new ToolCallBuffer(),
    transcript: {
      assistantDeltas: new Map(),
      callerDeltas: new Map(),
      seen: new Set(),
      lastCallerTranscriptAt: 0,
    },
    completion: {
      finalMessageIssued: false,
      finalMessageSpoken: false,
      outputAudioBufferStopped: false,
      outputAudioBufferCleared: false,
    },
    interruption: {
      assistantSpeaking: false,
      lastConfirmedAt: 0,
    },
  };
}

type ToolExecutionContext = {
  dataChannel: RTCDataChannel;
  context: RealtimeVoiceContext;
  transcriptState: TranscriptState;
  completionState: CompletionState;
  closeSession: () => void;
  callbacks: RealtimeVoiceCallbacks;
};

type ToolOutputSender = (toolOutput: unknown, status?: string) => void;

async function handleRealtimeServerEvent(
  rawEvent: string,
  dataChannel: RTCDataChannel,
  context: RealtimeVoiceContext,
  runtime: RealtimeRuntime,
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
  captureRealtimeTranscript(event, item, context, runtime.transcript);
  captureAssistantTranscript(event, item, runtime.completion);
  handleOutputAudioBufferEvent(
    event,
    runtime.completion,
    runtime.interruption,
    closeSession,
    callbacks,
  );
  handleSpeechInterruptionEvent(
    event,
    item,
    dataChannel,
    runtime.completion,
    runtime.interruption,
  );
  maybeCloseAfterSpokenFinal(runtime.completion, closeSession, callbacks);

  const callIdForEvent = item.call_id ?? event.call_id;
  if (item.type === "function_call" && callIdForEvent && item.name) {
    runtime.tools.rememberName(callIdForEvent, item.name);
  }

  if (event.type === "response.function_call_arguments.delta" && callIdForEvent) {
    runtime.tools.appendArguments(callIdForEvent, event.delta);
    return;
  }

  const isDoneEvent =
    isFunctionCallDoneEvent(event, item);
  if (!isDoneEvent) return;

  const toolCall = runtime.tools.consumeCompleted(event, item);
  if (!toolCall) return;
  await executeRealtimeToolCall(toolCall, {
    dataChannel,
    context,
    transcriptState: runtime.transcript,
    completionState: runtime.completion,
    closeSession,
    callbacks,
  });
}

async function executeRealtimeToolCall(
  toolCall: CompletedToolCall,
  execution: ToolExecutionContext,
) {
  const { name, callId, argsText } = toolCall;
  const {
    dataChannel,
    context,
    transcriptState,
    completionState,
    closeSession,
    callbacks,
  } = execution;

  logRealtimeTool("call", { name, callId, arguments: argsText });

  let output: unknown;
  let args: Record<string, unknown> = {};
  const sendOutputAndTrace = (toolOutput: unknown, status = "ok") => {
    logRealtimeTool("output", { name, callId, output: summarizeToolOutput(toolOutput) });
    recordToolCallTrace(context.caseRef, name, callId, args, toolOutput, status);
    sendFunctionOutput(dataChannel, callId, toolOutput);
  };
  try {
    args = JSON.parse(argsText) as Record<string, unknown>;
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
      const callerFallbackText = callerFallbackForRecordedStep(args);
      const updatedClaim = await updateBackendFacts(
        context.caseRef,
        factsForRecordedStep(args),
      );
      appendCallerFallbackIfNeeded(context.caseRef, callerFallbackText, transcriptState);
      output = summarizeClaimForAgent(updatedClaim);
    } else if (name === "end_call") {
      await handleEndCallTool(args, execution, sendOutputAndTrace);
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
  sendOutputAndTrace(output, outputStatus(output));
  requestModelResponse(dataChannel);
}

async function handleEndCallTool(
  args: Record<string, unknown>,
  execution: ToolExecutionContext,
  sendOutput: ToolOutputSender,
) {
  const {
    dataChannel,
    context,
    completionState,
    closeSession,
    callbacks,
  } = execution;
  const requestedDisposition: RealtimeVoiceDoneDisposition =
    args.disposition === "human_callback"
      ? "human_callback"
      : args.disposition === "cancelled"
        ? "cancelled"
        : "complete";
  const callbackReason = nonEmptyString(args.reason);
  const safetySummary = nonEmptyString(args.safetySummary);
  const safetyCancellation =
    requestedDisposition !== "complete" &&
    (isSecurityExit(callbackReason, safetySummary) ||
      isUnsafeSafetyCallback(callbackReason, safetySummary));
  const disposition: RealtimeVoiceDoneDisposition = safetyCancellation
    ? "cancelled"
    : requestedDisposition;

  if (disposition === "complete") {
    const continuation = await validateCompleteEndCall(context.caseRef, completionState);
    if (continuation) {
      continueToolResponse(dataChannel, sendOutput, continuation.output, continuation.status);
      return;
    }
  }

  let resolvedCallbackReason = callbackReason;
  if (disposition === "human_callback") {
    resolvedCallbackReason = await prepareHumanCallbackEndCall(
      context.caseRef,
      callbackReason,
      safetySummary,
      completionState,
      dataChannel,
      sendOutput,
    );
    if (!completionState.finalMessageSpoken) return;
  }
  if (disposition === "cancelled") {
    const cancellation = await prepareCancelledEndCall(
      context.caseRef,
      callbackReason,
      safetySummary,
      completionState,
      dataChannel,
      sendOutput,
    );
    resolvedCallbackReason = cancellation.reason;
    if (cancellation.waitingForFinalMessage) return;
  }

  const output = { ended: true, disposition, reason: resolvedCallbackReason };
  sendOutput(output);
  completionState.pendingClose = {
    disposition,
    reason: resolvedCallbackReason,
    doneNotified: false,
  };
  maybeFinishRealtimeCallAfterAudioStopped(
    completionState,
    closeSession,
    callbacks,
  );
}

async function prepareCancelledEndCall(
  caseRef: string,
  callbackReason: string | undefined,
  safetySummary: string | undefined,
  completionState: CompletionState,
  dataChannel: RTCDataChannel,
  sendOutput: ToolOutputSender,
) {
  if (safetySummary) {
    await updateBackendFacts(caseRef, {
      safetyKnown: false,
      safetySummary,
    });
  }

  const securityExit = isSecurityExit(callbackReason, safetySummary);
  const unsafeSafetyCallback = securityExit || isUnsafeSafetyCallback(callbackReason, safetySummary);
  const finalReason =
    callbackReason ??
    (securityExit
      ? SECURITY_EXIT_REASON
      : unsafeSafetyCallback
        ? "Caller was not in a safe place for roadside intake."
        : "Call cancelled.");

  if (!unsafeSafetyCallback) {
    return { reason: finalReason, waitingForFinalMessage: false };
  }

  if (completionState.finalMessageSpoken) {
    completionState.finalMessageIssued = true;
    completionState.spokenDisposition = "cancelled";
    completionState.spokenReason ??= finalReason;
    return { reason: finalReason, waitingForFinalMessage: false };
  }

  if (!completionState.finalMessageIssued) {
    completionState.finalMessageIssued = true;
    completionState.spokenReason = finalReason;
    continueToolResponse(
      dataChannel,
      sendOutput,
      pendingFinalMessageOutput(SECURITY_EXIT_MESSAGE, true, "first_request"),
    );
    return { reason: finalReason, waitingForFinalMessage: true };
  }

  completionState.spokenReason = finalReason;
  continueToolResponse(
    dataChannel,
    sendOutput,
    {
      ...pendingFinalMessageOutput(SECURITY_EXIT_MESSAGE, true, "repeat_request"),
      lastAssistantTranscript: completionState.lastAssistantTranscript,
    },
  );
  return { reason: finalReason, waitingForFinalMessage: true };
}

async function validateCompleteEndCall(
  caseRef: string,
  completionState: CompletionState,
) {
  const nextStep = await getBackendNextStep(caseRef);
  if (nextStep.allowedAction !== "coverage_decision") {
    return {
      status: "blocked",
      output: {
        ended: false,
        disposition: "continue",
        allowedAction: nextStep.allowedAction,
        nextQuestion: nextStep.question,
        reason: `Backend intake is incomplete: ${nextStep.reason}`,
        blockedActions: nextStep.blockedActions,
      },
    };
  }

  if (completionState.finalMessageSpoken) {
    completionState.finalMessageIssued = true;
  }
  if (!completionState.finalMessageIssued) {
    completionState.finalMessageIssued = true;
    return {
      status: "ok",
      output: {
        ended: false,
        disposition: "continue",
        finalMessage: COMPLETE_FINAL_MESSAGE,
      },
    };
  }
  if (!completionState.finalMessageSpoken) {
    return {
      status: "ok",
      output: {
        ended: false,
        disposition: "continue",
        finalMessage: COMPLETE_FINAL_MESSAGE,
        reason:
          "The final caller-facing SMS and next-best-action message has not been spoken yet. Say the finalMessage before calling end_call again.",
        lastAssistantTranscript: completionState.lastAssistantTranscript,
      },
    };
  }

  return null;
}

async function prepareHumanCallbackEndCall(
  caseRef: string,
  callbackReason: string | undefined,
  safetySummary: string | undefined,
  completionState: CompletionState,
  dataChannel: RTCDataChannel,
  sendOutput: ToolOutputSender,
) {
  if (safetySummary) {
    await updateBackendFacts(caseRef, {
      safetyKnown: false,
      safetySummary,
    });
  }

  const securityExit = isSecurityExit(callbackReason, safetySummary);
  const unsafeSafetyCallback = securityExit || isUnsafeSafetyCallback(callbackReason, safetySummary);
  const finalMessage = humanCallbackFinalMessage(callbackReason, safetySummary);
  const finalReason =
    callbackReason ??
    (securityExit
      ? SECURITY_EXIT_REASON
      : unsafeSafetyCallback
        ? "Caller was not in a safe place for roadside intake."
        : "AI agent routed the case to a human callback.");

  if (completionState.finalMessageSpoken) {
    completionState.finalMessageIssued = true;
    completionState.spokenDisposition = "human_callback";
    completionState.spokenReason ??= finalReason;
  }

  if (!completionState.finalMessageIssued) {
    completionState.finalMessageIssued = true;
    completionState.spokenReason = finalReason;
    continueToolResponse(
      dataChannel,
      sendOutput,
      pendingFinalMessageOutput(finalMessage, unsafeSafetyCallback, "first_request"),
    );
    return finalReason;
  }

  if (!completionState.finalMessageSpoken) {
    completionState.spokenReason = finalReason;
    continueToolResponse(
      dataChannel,
      sendOutput,
      {
        ...pendingFinalMessageOutput(finalMessage, unsafeSafetyCallback, "repeat_request"),
        lastAssistantTranscript: completionState.lastAssistantTranscript,
      },
    );
  }

  return finalReason;
}

function pendingFinalMessageOutput(
  finalMessage: string,
  unsafeSafetyCallback: boolean,
  requestKind: "first_request" | "repeat_request",
) {
  if (unsafeSafetyCallback) {
    return {
      ended: false,
      disposition: "continue",
      finalMessage,
      spokenTextMustEqual: finalMessage,
    };
  }

  return {
    ended: false,
    disposition: "continue",
    finalMessage,
    reason:
      requestKind === "first_request"
        ? "Say finalMessage to the caller before ending the call. Then call end_call again with the same disposition and reason."
        : "The final caller-facing message has not been spoken yet. Say finalMessage before calling end_call again.",
  };
}

function continueToolResponse(
  dataChannel: RTCDataChannel,
  sendOutput: ToolOutputSender,
  output: Record<string, unknown>,
  status = "ok",
) {
  sendOutput(output, status);
  requestModelResponse(dataChannel);
}

function isFunctionCallDoneEvent(
  event: RealtimeFunctionCall,
  item: RealtimeFunctionCall,
) {
  return (
    event.type === "response.function_call_arguments.done" ||
    (event.type === "response.output_item.done" && item.type === "function_call")
  );
}

function requestModelResponse(dataChannel: RTCDataChannel) {
  if (dataChannel.readyState !== "open") return;
  dataChannel.send(JSON.stringify({ type: "response.create" }));
}

function handleOutputAudioBufferEvent(
  event: RealtimeFunctionCall,
  completionState: CompletionState,
  interruptionState: InterruptionState,
  closeSession: () => void,
  callbacks: RealtimeVoiceCallbacks,
) {
  const type = event.type ?? "";
  if (type === "output_audio_buffer.started") {
    completionState.outputAudioBufferStopped = false;
    completionState.outputAudioBufferCleared = false;
    interruptionState.assistantSpeaking = true;
    return;
  }

  if (type === "output_audio_buffer.cleared") {
    completionState.outputAudioBufferStopped = false;
    completionState.outputAudioBufferCleared = true;
    interruptionState.assistantSpeaking = false;
    clearPendingInterruption(interruptionState);
    return;
  }

  if (type === "output_audio_buffer.stopped") {
    completionState.outputAudioBufferStopped = true;
    completionState.outputAudioBufferCleared = false;
    interruptionState.assistantSpeaking = false;
    clearPendingInterruption(interruptionState);
    maybeFinishRealtimeCallAfterAudioStopped(
      completionState,
      closeSession,
      callbacks,
    );
  }
}

function handleSpeechInterruptionEvent(
  event: RealtimeFunctionCall,
  item: RealtimeFunctionCall,
  dataChannel: RTCDataChannel,
  completionState: CompletionState,
  interruptionState: InterruptionState,
) {
  const type = event.type ?? "";
  if (capturesUserTranscript(type, item)) {
    capturePendingInterruptionTranscript(event, item, dataChannel, interruptionState);
  }

  if (type === "input_audio_buffer.speech_started") {
    startPendingInterruption(event, dataChannel, completionState, interruptionState);
    return;
  }

  if (type === "input_audio_buffer.speech_stopped") {
    stopPendingInterruption(event, dataChannel, interruptionState);
  }
}

function startPendingInterruption(
  event: RealtimeFunctionCall,
  dataChannel: RTCDataChannel,
  completionState: CompletionState,
  interruptionState: InterruptionState,
) {
  if (!interruptionState.assistantSpeaking) return;
  if (completionState.finalMessageIssued || completionState.pendingClose) return;

  const now = Date.now();
  if (now - interruptionState.lastConfirmedAt < INTERRUPTION_COOLDOWN_MS) {
    return;
  }

  clearPendingInterruption(interruptionState);
  const pending: PendingInterruption = {
    itemId: event.item_id,
    serverStartMs: event.audio_start_ms,
    localStartedAt: now,
    confirmed: false,
  };
  interruptionState.pending = pending;
  pending.timer = window.setTimeout(() => {
    const active = interruptionState.pending;
    if (!active || active !== pending || active.confirmed) return;
    if (shouldRejectInterruption(active, Date.now() - active.localStartedAt)) return;
    confirmInterruption(dataChannel, interruptionState, "confirmation_window");
  }, BARGE_IN_CONFIRMATION_MS);
}

function stopPendingInterruption(
  event: RealtimeFunctionCall,
  dataChannel: RTCDataChannel,
  interruptionState: InterruptionState,
) {
  const pending = interruptionState.pending;
  if (!pending || pending.confirmed) return;

  const durationMs =
    event.audio_end_ms !== undefined && pending.serverStartMs !== undefined
      ? event.audio_end_ms - pending.serverStartMs
      : Date.now() - pending.localStartedAt;

  if (durationMs < MIN_BARGE_IN_DURATION_MS || shouldRejectInterruption(pending, durationMs)) {
    clearPendingInterruption(interruptionState);
    return;
  }

  confirmInterruption(dataChannel, interruptionState, "speech_stopped");
}

function capturePendingInterruptionTranscript(
  event: RealtimeFunctionCall,
  item: RealtimeFunctionCall,
  dataChannel: RTCDataChannel,
  interruptionState: InterruptionState,
) {
  const pending = interruptionState.pending;
  if (!pending || pending.confirmed) return;

  const transcript = firstNonEmpty(event.transcript, item.transcript, event.text, item.text);
  if (!transcript) return;
  if (event.item_id && pending.itemId && event.item_id !== pending.itemId) return;

  pending.transcript = transcript;
  if (isExplicitInterrupt(transcript)) {
    confirmInterruption(dataChannel, interruptionState, "explicit_transcript");
    return;
  }

  if (isTinyFiller(transcript)) {
    clearPendingInterruption(interruptionState);
  }
}

function confirmInterruption(
  dataChannel: RTCDataChannel,
  interruptionState: InterruptionState,
  reason: string,
) {
  const pending = interruptionState.pending;
  if (!pending || pending.confirmed || dataChannel.readyState !== "open") return;

  pending.confirmed = true;
  interruptionState.lastConfirmedAt = Date.now();
  sendRealtimeControlEvent(dataChannel, { type: "response.cancel" });
  sendRealtimeControlEvent(dataChannel, { type: "output_audio_buffer.clear" });
  logRealtimeTool("barge_in_confirmed", {
    reason,
    durationMs: Date.now() - pending.localStartedAt,
    transcript: pending.transcript,
  });
  clearPendingInterruption(interruptionState);
}

function clearPendingInterruption(interruptionState: InterruptionState) {
  if (interruptionState.pending?.timer) {
    window.clearTimeout(interruptionState.pending.timer);
  }
  interruptionState.pending = undefined;
}

function shouldRejectInterruption(
  pending: PendingInterruption,
  durationMs: number,
) {
  if (durationMs < MIN_BARGE_IN_DURATION_MS) return true;
  const transcript = pending.transcript;
  if (!transcript) return false;
  if (isExplicitInterrupt(transcript)) return false;
  if (isTinyFiller(transcript)) return true;
  return false;
}

function capturesUserTranscript(type: string, item: RealtimeFunctionCall) {
  return type.includes("input_audio_transcription") || item.role === "user";
}

function isExplicitInterrupt(transcript: string) {
  return EXPLICIT_INTERRUPT_PATTERNS.some((pattern) => pattern.test(transcript));
}

function isTinyFiller(transcript: string) {
  const normalized = normalizeShortUtterance(transcript);
  return SHORT_FILLERS.has(normalized);
}

function normalizeShortUtterance(transcript: string) {
  return transcript
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sendRealtimeControlEvent(
  dataChannel: RTCDataChannel,
  payload: Record<string, unknown>,
) {
  if (dataChannel.readyState !== "open") return;
  try {
    dataChannel.send(JSON.stringify(payload));
  } catch {
    // The session may already be closing; interruption control is best-effort.
  }
}

function maybeCloseAfterSpokenFinal(
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

  maybeFinishRealtimeCallAfterAudioStopped(
    completionState,
    closeSession,
    callbacks,
  );
}

function maybeFinishRealtimeCallAfterAudioStopped(
  completionState: CompletionState,
  closeSession: () => void,
  callbacks: RealtimeVoiceCallbacks,
) {
  if (
    !completionState.outputAudioBufferStopped ||
    completionState.outputAudioBufferCleared ||
    !completionState.pendingClose
  ) {
    return;
  }

  finishRealtimeCall(completionState, closeSession, callbacks);
}

function finishRealtimeCall(
  completionState: CompletionState,
  closeSession: () => void,
  callbacks: RealtimeVoiceCallbacks,
) {
  const pendingClose = completionState.pendingClose;
  if (!pendingClose || pendingClose.doneNotified) return;
  pendingClose.doneNotified = true;
  closeSession();
  void callbacks.onDone?.(pendingClose.disposition, pendingClose.reason);
}

function firstNonEmpty(...values: Array<string | undefined>) {
  return values.find((value) => value !== undefined && value.trim().length > 0);
}

function humanCallbackFinalMessage(reason?: string, safetySummary?: string) {
  if (isSecurityExit(reason, safetySummary) || isUnsafeSafetyCallback(reason, safetySummary)) {
    return SECURITY_EXIT_MESSAGE;
  }

  return "I will pass this to a roadside specialist. They will call you back as soon as one is available, and I will send a text confirmation now.";
}

function isSecurityExit(reason?: string, safetySummary?: string) {
  const text = `${reason ?? ""} ${safetySummary ?? ""}`.toLowerCase();
  return (
    text.includes("security exit") ||
    text.includes("immediate safety") ||
    text.includes("immediate danger") ||
    text.includes("emergency services") ||
    text.includes("injury") ||
    text.includes("injured") ||
    text.includes("hurt") ||
    text.includes("smoke") ||
    text.includes("fire") ||
    text.includes("flood") ||
    text.includes("ev battery") ||
    text.includes("high-voltage")
  );
}

function captureRealtimeTranscript(
  event: RealtimeFunctionCall,
  item: RealtimeFunctionCall,
  context: RealtimeVoiceContext,
  transcriptState: TranscriptState,
) {
  const type = event.type ?? "";

  if (isAssistantTranscriptDelta(type)) {
    const key = transcriptEventKey(event, item, "agent");
    transcriptState.assistantDeltas.set(
      key,
      `${transcriptState.assistantDeltas.get(key) ?? ""}${event.delta ?? ""}`,
    );
    return;
  }

  if (isAssistantTranscriptDone(type)) {
    const key = transcriptEventKey(event, item, "agent");
    const transcript = firstNonEmpty(
      event.transcript,
      item.transcript,
      event.text,
      item.text,
      transcriptState.assistantDeltas.get(key),
    );
    transcriptState.assistantDeltas.delete(key);
    appendTranscriptTurn(context.caseRef, "agent", transcript, key, transcriptState);
    return;
  }

  if (type === "conversation.item.input_audio_transcription.delta") {
    const key = transcriptEventKey(event, item, "caller");
    transcriptState.callerDeltas.set(
      key,
      `${transcriptState.callerDeltas.get(key) ?? ""}${event.delta ?? ""}`,
    );
    return;
  }

  if (type === "conversation.item.input_audio_transcription.completed") {
    const key = transcriptEventKey(event, item, "caller");
    appendTranscriptTurn(
      context.caseRef,
      "caller",
      firstNonEmpty(
        event.transcript,
        item.transcript,
        event.text,
        item.text,
        transcriptState.callerDeltas.get(key),
      ),
      key,
      transcriptState,
    );
    transcriptState.callerDeltas.delete(key);
    return;
  }

  if (type === "response.output_item.done" && item.role === "assistant") {
    appendTranscriptTurn(
      context.caseRef,
      "agent",
      firstNonEmpty(item.transcript, event.transcript, item.text, event.text),
      transcriptEventKey(event, item, "agent"),
      transcriptState,
    );
  }
}

function isAssistantTranscriptDelta(type: string) {
  return type === "response.audio_transcript.delta" || type === "response.output_audio_transcript.delta";
}

function isAssistantTranscriptDone(type: string) {
  return type === "response.audio_transcript.done" || type === "response.output_audio_transcript.done";
}

function transcriptEventKey(
  event: RealtimeFunctionCall,
  item: RealtimeFunctionCall,
  speaker: "agent" | "caller",
) {
  return [
    speaker,
    event.item_id ?? item.item_id ?? "",
    event.response_id ?? "",
    event.output_index ?? "",
    event.content_index ?? "",
  ].join(":");
}

function appendTranscriptTurn(
  caseRef: string,
  speaker: "agent" | "caller",
  transcript: string | undefined,
  eventKey: string,
  transcriptState: TranscriptState,
) {
  const text = transcript?.trim();
  if (!text) return;

  const fingerprint = `${eventKey}:${text}`;
  if (transcriptState.seen.has(fingerprint)) return;
  transcriptState.seen.add(fingerprint);
  if (speaker === "caller") {
    transcriptState.lastCallerTranscriptAt = Date.now();
  }

  void appendBackendTranscript(caseRef, { speaker, text }).catch(() => undefined);
}

function appendCallerFallbackIfNeeded(
  caseRef: string,
  text: string | undefined,
  transcriptState: TranscriptState,
) {
  const trimmed = text?.trim();
  if (!trimmed) return;

  window.setTimeout(() => {
    if (Date.now() - transcriptState.lastCallerTranscriptAt < 2_500) return;
    appendTranscriptTurn(
      caseRef,
      "caller",
      trimmed,
      `tool-fallback:${normalizeShortUtterance(trimmed)}`,
      transcriptState,
    );
  }, 1_200);
}

function isUnsafeSafetyCallback(reason?: string, safetySummary?: string) {
  const text = `${reason ?? ""} ${safetySummary ?? ""}`.toLowerCase();
  return (
    text.includes("safe place") ||
    text.includes("not safe") ||
    text.includes("unsafe") ||
    text.includes("middle of the road") ||
    text.includes("in the road") ||
    text.includes("in traffic") ||
    text.includes("live traffic") ||
    text.includes("not away from traffic")
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
    normalized.includes("emergency services") &&
    normalized.includes("cannot continue roadside intake")
  ) {
    completionState.finalMessageSpoken = true;
    completionState.spokenDisposition = "cancelled";
    completionState.spokenReason = SECURITY_EXIT_REASON;
  }
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
    (normalized.includes("get to safety") ||
      normalized.includes("away from traffic") ||
      normalized.includes("emergency services")) &&
    normalized.includes("call") &&
    normalized.includes("back")
  ) {
    completionState.finalMessageSpoken = true;
    completionState.spokenDisposition = "cancelled";
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

function callerFallbackForRecordedStep(args: Record<string, unknown>) {
  const step = String(args.step ?? "");
  if (step === "location") return nonEmptyString(args.location);
  if (step === "incident") return nonEmptyString(args.incidentSummary);
  return undefined;
}

function summarizeClaimForAgent(claim: ClaimSession) {
  return {
    recorded: true,
    status: claim.workflow.status,
    stage: claim.workflow.stage,
    allowedAction: claim.workflow.stateEvaluation?.allowedAction,
    nextQuestion: claim.workflow.stateEvaluation?.question,
    reason: claim.workflow.stateEvaluation?.reason,
    missingFacts: claim.workflow.missingFacts,
    blockedActions: claim.workflow.blockedActions,
    locationDispatchable: claim.artifacts.locationResolution?.dispatchable,
    resolvedArea: claim.artifacts.locationResolution?.normalizedArea,
    identityConfirmed: claim.intakeFacts.identityConfirmed,
    vehicleConfirmed: claim.intakeFacts.vehicleConfirmed,
    locationConfirmed: claim.intakeFacts.locationConfirmed,
    incidentKnown: claim.intakeFacts.incidentKnown,
    recordedLocation: claim.intakeFacts.location,
    resolvedAddress: claim.artifacts.locationResolution?.formattedAddress,
    candidateAddresses: claim.artifacts.locationResolution?.candidateAddresses,
    locationRequiresConfirmation: claim.artifacts.locationResolution?.requiresCallerConfirmation,
    locationSource: claim.artifacts.locationResolution?.source,
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
    cancellationRequired: record.cancellationRequired,
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

function outputStatus(output: unknown) {
  if (!output || typeof output !== "object") return "error";
  const record = output as Record<string, unknown>;
  if (record.verified === false || record.ended === false) return "blocked";
  return "ok";
}

function summarizeToolArguments(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (toolName === "verify_known_pin") {
    return {
      firstDigit: "[redacted]",
      secondDigit: "[redacted]",
    };
  }
  if (toolName === "verify_unknown_identity") {
    return {
      name: args.name ? "[provided]" : undefined,
      birthDate: args.birthDate ? "[provided]" : undefined,
      firstDigit: "[redacted]",
      secondDigit: "[redacted]",
    };
  }
  if (toolName === "record_intake_step") {
    return {
      step: args.step,
      vehicleId: args.vehicleId,
      location: args.location,
      locationVerifiedByCaller: args.locationVerifiedByCaller,
      incidentSummary: args.incidentSummary,
    };
  }
  if (toolName === "end_call") {
    return {
      disposition: args.disposition,
      reason: args.reason,
      hasSafetySummary: Boolean(args.safetySummary),
    };
  }
  return {};
}

function asSummaryRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { value };
}

function recordToolCallTrace(
  claimId: string,
  toolName: string,
  callId: string,
  args: Record<string, unknown>,
  output: unknown,
  status: string,
) {
  void appendBackendToolCall(claimId, {
    toolName,
    callId,
    status,
    argumentsSummary: summarizeToolArguments(toolName, args),
    resultSummary: asSummaryRecord(summarizeToolOutput(output)),
  }).catch((error) => {
    console.info("[realtime-tool]", "failed to persist tool trace", error);
  });
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
