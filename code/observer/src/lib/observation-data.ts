export type CaseStatus =
  | "created"
  | "in_progress"
  | "needs_human_callback"
  | "cancelled"
  | "not_covered"
  | "completed";

export type AuthMethod =
  | "phone_match_pin"
  | "full_verification"
  | "not_policyholder"
  | "unverified";

export type AttentionFlag =
  | "unsafe"
  | "auth retry"
  | "auth failed"
  | "unknown number"
  | "location unclear"
  | "incident unclear"
  | "not policyholder"
  | "no SMS";

export type TranscriptTurn = {
  speaker: "agent" | "caller";
  text: string;
  time: string;
};

export type SystemEvent = {
  type: string;
  status: "ok" | "blocked" | "skipped" | "info" | "warn";
  label: string;
  time: string;
};

export type GateStatus =
  | "ok"
  | "blocked"
  | "skipped"
  | "not_reached"
  | "pending";

export type ObservedCase = {
  caseRef: string;
  status: CaseStatus;
  stage: string;
  updatedAt?: string;
  coverageOutcome?: "covered" | "not_covered";
  authMethod: AuthMethod;
  attentionFlags: AttentionFlag[];
  callerPhone: string;
  callerLabel: string;
  policyholderName?: string;
  vehicleLabel?: string;
  vehicleConfirmed: boolean;
  incident?: string;
  location?: string;
  locationDispatchable?: boolean;
  incidentClassified?: boolean;
  outcomeReason?: string;
  finalAgentMessage?: string;
  smsPreview?: string | null;
  elapsed: string;
  lastUpdate: string;
  pinAttempts?: string;
  gates: {
    safetyChecked: GateStatus;
    identityVerified: GateStatus;
    vehicleConfirmed: GateStatus;
    locationDispatchable: GateStatus;
    incidentClassified: GateStatus;
    coverageReviewAllowed: GateStatus;
    smsGenerated: GateStatus;
  };
  coverage?: {
    evaluated: boolean;
    policy?: string;
    rules?: { label: string; result: "pass" | "fail" | "n/a" }[];
    reason?: string;
  };
  nextAction?: {
    evaluated: boolean;
    actionType?: string;
    provider?: string;
    eta?: string;
    reason?: string;
  };
  transcript: TranscriptTurn[];
  events: SystemEvent[];
};

export const CASES: ObservedCase[] = [
  {
    caseRef: "AST-8F41C2A9",
    status: "cancelled",
    stage: "Safety check",
    authMethod: "unverified",
    attentionFlags: ["unsafe", "no SMS"],
    callerPhone: "+44 7700 900 184",
    callerLabel: "Unknown caller",
    vehicleConfirmed: false,
    elapsed: "00:42",
    lastUpdate: "just now",
    outcomeReason: "Caller was not safely away from traffic.",
    finalAgentMessage:
      "If anyone may be injured or in immediate danger, call emergency services now. Move to a safe place if you can. We cannot continue roadside intake until everyone is safe.",
    smsPreview: null,
    gates: {
      safetyChecked: "blocked",
      identityVerified: "not_reached",
      vehicleConfirmed: "not_reached",
      locationDispatchable: "not_reached",
      incidentClassified: "not_reached",
      coverageReviewAllowed: "blocked",
      smsGenerated: "skipped",
    },
    coverage: {
      evaluated: false,
      reason: "Security exit before intake",
    },
    nextAction: {
      evaluated: false,
      reason:
        "If anyone may be injured or in immediate danger, call emergency services now. Move to a safe place if you can. We cannot continue roadside intake until everyone is safe.",
    },
    transcript: [
      {
        speaker: "agent",
        text: "Aster Roadside, is everyone safe and away from traffic or immediate danger?",
        time: "14:02:11",
      },
      {
        speaker: "caller",
        text: "No, I am in the middle of the road.",
        time: "14:02:18",
      },
      {
        speaker: "agent",
        text: "If anyone may be injured or in immediate danger, call emergency services now. Move to a safe place if you can. We cannot continue roadside intake until everyone is safe.",
        time: "14:02:24",
      },
    ],
    events: [
      { type: "case.created", status: "info", label: "Case created", time: "14:02:08" },
      { type: "safety.detected", status: "warn", label: "Unsafe condition detected", time: "14:02:20" },
      { type: "end_call", status: "blocked", label: "End call requested", time: "14:02:26" },
      { type: "case.finalized", status: "blocked", label: "Case finalized: security exit", time: "14:02:27" },
      { type: "sms.skipped", status: "skipped", label: "SMS skipped (security exit)", time: "14:02:27" },
    ],
  },
  {
    caseRef: "AST-7C03B118",
    status: "completed",
    stage: "Dispatched",
    authMethod: "phone_match_pin",
    attentionFlags: [],
    callerPhone: "+44 7700 900 221",
    callerLabel: "James Whitfield",
    policyholderName: "James Whitfield",
    vehicleLabel: "2021 Volkswagen Golf · LR21 KFM",
    vehicleConfirmed: true,
    incident: "Flat tyre, front passenger side",
    location: "A4 westbound, near Heston services",
    locationDispatchable: true,
    incidentClassified: true,
    elapsed: "04:12",
    lastUpdate: "9m ago",
    pinAttempts: "1 / 3",
    outcomeReason: "Repair truck dispatched.",
    smsPreview:
      "Aster Roadside: a repair truck is on the way, ETA 35 min. Track at aster.co/r/AST-7C03B118.",
    gates: {
      safetyChecked: "ok",
      identityVerified: "ok",
      vehicleConfirmed: "ok",
      locationDispatchable: "ok",
      incidentClassified: "ok",
      coverageReviewAllowed: "ok",
      smsGenerated: "ok",
    },
    coverage: {
      evaluated: true,
      policy: "Comprehensive · POL-44982",
      rules: [
        { label: "Roadside cover active", result: "pass" },
        { label: "Annual call-out limit", result: "pass" },
        { label: "Vehicle on policy", result: "pass" },
      ],
    },
    nextAction: {
      evaluated: true,
      actionType: "Repair truck",
      provider: "Aster Mobile Technician",
      eta: "35 min",
    },
    transcript: [
      { speaker: "agent", text: "Aster Roadside, is everyone safe and away from traffic?", time: "13:58:02" },
      { speaker: "caller", text: "Yes, we're on the hard shoulder.", time: "13:58:09" },
      { speaker: "agent", text: "Thanks. Can I take your policy number or the phone number on the policy?", time: "13:58:14" },
      { speaker: "caller", text: "It's this number. James Whitfield.", time: "13:58:22" },
      { speaker: "agent", text: "Got it. Please confirm the four-digit PIN on your policy.", time: "13:58:28" },
      { speaker: "caller", text: "Four nine two one.", time: "13:58:33" },
      { speaker: "agent", text: "Confirmed. What's happened with the vehicle?", time: "13:58:39" },
      { speaker: "caller", text: "Front passenger tyre is flat.", time: "13:58:44" },
    ],
    events: [
      { type: "case.created", status: "info", label: "Case created", time: "13:58:00" },
      { type: "safety.checked", status: "ok", label: "Safety confirmed", time: "13:58:10" },
      { type: "auth.phone_match", status: "ok", label: "Phone matched policy POL-44982", time: "13:58:24" },
      { type: "auth.pin", status: "ok", label: "PIN verified (1/3)", time: "13:58:34" },
      { type: "vehicle.confirmed", status: "ok", label: "Vehicle confirmed on policy", time: "13:58:40" },
      { type: "incident.classified", status: "ok", label: "Incident: flat tyre", time: "13:58:46" },
      { type: "coverage.evaluated", status: "ok", label: "Coverage approved", time: "13:58:49" },
      { type: "dispatch.requested", status: "ok", label: "Repair truck dispatched", time: "13:58:55" },
      { type: "sms.sent", status: "ok", label: "Confirmation SMS sent", time: "13:58:57" },
    ],
  },
  {
    caseRef: "AST-7B98E041",
    status: "needs_human_callback",
    stage: "Full verification callback",
    authMethod: "full_verification",
    attentionFlags: ["unknown number"],
    callerPhone: "+44 7700 900 555",
    callerLabel: "Unknown caller",
    vehicleConfirmed: false,
    elapsed: "02:14",
    lastUpdate: "14m ago",
    pinAttempts: "0 / 3",
    outcomeReason: "Unknown number requires assisted verification.",
    finalAgentMessage:
      "I need a specialist to complete verification. A human agent will call you back shortly.",
    smsPreview:
      "Aster Roadside: a specialist will call you back to complete verification. Ref AST-7B98E041.",
    gates: {
      safetyChecked: "ok",
      identityVerified: "blocked",
      vehicleConfirmed: "not_reached",
      locationDispatchable: "not_reached",
      incidentClassified: "not_reached",
      coverageReviewAllowed: "blocked",
      smsGenerated: "ok",
    },
    coverage: { evaluated: false, reason: "Identity not verified" },
    nextAction: { evaluated: false, reason: "Human callback required for assisted verification." },
    transcript: [
      { speaker: "agent", text: "Aster Roadside, is everyone safe?", time: "13:55:10" },
      { speaker: "caller", text: "Yes we're fine, off the road.", time: "13:55:17" },
      { speaker: "agent", text: "This number isn't on a policy. Can I take your full name and date of birth?", time: "13:55:24" },
      { speaker: "caller", text: "Sarah Donnelly, fourteenth of June nineteen eighty-eight.", time: "13:55:32" },
      { speaker: "agent", text: "I need a specialist to complete verification. A human agent will call you back shortly.", time: "13:55:44" },
    ],
    events: [
      { type: "case.created", status: "info", label: "Case created", time: "13:55:08" },
      { type: "safety.checked", status: "ok", label: "Safety confirmed", time: "13:55:18" },
      { type: "auth.phone_match", status: "warn", label: "Phone not on file — full verification", time: "13:55:22" },
      { type: "case.routed", status: "warn", label: "Routed to human callback", time: "13:55:45" },
      { type: "sms.sent", status: "ok", label: "Callback SMS generated", time: "13:55:46" },
    ],
  },
  {
    caseRef: "AST-6A12D773",
    status: "needs_human_callback",
    stage: "Failed auth",
    authMethod: "phone_match_pin",
    attentionFlags: ["auth failed", "auth retry"],
    callerPhone: "+44 7700 900 311",
    callerLabel: "Mark Petrov",
    policyholderName: "Mark Petrov",
    vehicleConfirmed: false,
    elapsed: "03:02",
    lastUpdate: "2m ago",
    pinAttempts: "3 / 3",
    outcomeReason: "PIN failed after 3 attempts.",
    finalAgentMessage:
      "I can't verify the PIN. A human agent will call you back on this number shortly.",
    smsPreview:
      "Aster Roadside: we couldn't verify your PIN. An agent will call +44 7700 900 311 within 10 minutes. Ref AST-6A12D773.",
    gates: {
      safetyChecked: "ok",
      identityVerified: "blocked",
      vehicleConfirmed: "not_reached",
      locationDispatchable: "not_reached",
      incidentClassified: "not_reached",
      coverageReviewAllowed: "blocked",
      smsGenerated: "ok",
    },
    coverage: { evaluated: false, reason: "Identity not verified" },
    nextAction: { evaluated: false, reason: "Human callback scheduled." },
    transcript: [
      { speaker: "agent", text: "Confirm your four-digit PIN please.", time: "13:50:11" },
      { speaker: "caller", text: "One two three four.", time: "13:50:16" },
      { speaker: "agent", text: "That doesn't match. Try once more.", time: "13:50:21" },
      { speaker: "caller", text: "Four three two one.", time: "13:50:27" },
      { speaker: "agent", text: "Still no match. One last try.", time: "13:50:32" },
      { speaker: "caller", text: "Nine nine nine nine.", time: "13:50:37" },
      { speaker: "agent", text: "I can't verify the PIN. A human agent will call you back on this number shortly.", time: "13:50:43" },
    ],
    events: [
      { type: "auth.pin", status: "blocked", label: "PIN failed (3/3)", time: "13:50:38" },
      { type: "case.routed", status: "warn", label: "Routed to human callback", time: "13:50:44" },
      { type: "sms.sent", status: "ok", label: "Callback SMS generated", time: "13:50:45" },
    ],
  },
  {
    caseRef: "AST-5D67A902",
    status: "needs_human_callback",
    stage: "Not policyholder",
    authMethod: "not_policyholder",
    attentionFlags: ["not policyholder"],
    callerPhone: "+44 7700 900 077",
    callerLabel: "Caller (spouse)",
    policyholderName: "Helen Brooks",
    vehicleConfirmed: false,
    elapsed: "01:30",
    lastUpdate: "8m ago",
    outcomeReason: "Caller is not the named policyholder.",
    finalAgentMessage:
      "I'll need to speak with the policyholder. We'll call Helen back on the policy number on file.",
    smsPreview:
      "Aster Roadside: an agent will call the policyholder on file shortly regarding the call. Ref AST-5D67A902.",
    gates: {
      safetyChecked: "ok",
      identityVerified: "blocked",
      vehicleConfirmed: "not_reached",
      locationDispatchable: "not_reached",
      incidentClassified: "not_reached",
      coverageReviewAllowed: "blocked",
      smsGenerated: "ok",
    },
    coverage: { evaluated: false, reason: "Caller not authorised" },
    nextAction: { evaluated: false, reason: "Callback to policyholder on file." },
    transcript: [
      { speaker: "agent", text: "Are you the named policyholder?", time: "13:42:02" },
      { speaker: "caller", text: "No, I'm her husband.", time: "13:42:06" },
      { speaker: "agent", text: "I'll need to speak with the policyholder. We'll call Helen back on the policy number on file.", time: "13:42:12" },
    ],
    events: [
      { type: "auth.not_policyholder", status: "blocked", label: "Caller not policyholder", time: "13:42:08" },
      { type: "case.routed", status: "warn", label: "Routed to human callback", time: "13:42:13" },
      { type: "sms.sent", status: "ok", label: "Callback SMS generated", time: "13:42:14" },
    ],
  },
  {
    caseRef: "AST-4B22F019",
    status: "completed",
    stage: "Dispatched",
    authMethod: "phone_match_pin",
    attentionFlags: [],
    callerPhone: "+44 7700 900 412",
    callerLabel: "Olivia Hart",
    policyholderName: "Olivia Hart",
    vehicleLabel: "2019 Ford Focus · BD19 OHA",
    vehicleConfirmed: true,
    incident: "Flat tyre",
    location: "Tesco Extra car park, Watford",
    locationDispatchable: true,
    incidentClassified: true,
    elapsed: "06:18",
    lastUpdate: "22m ago",
    pinAttempts: "1 / 3",
    outcomeReason: "Repair truck dispatched.",
    smsPreview:
      "Aster Roadside: a repair truck is on the way, ETA 35 min. Track at aster.co/r/AST-4B22F019.",
    gates: {
      safetyChecked: "ok",
      identityVerified: "ok",
      vehicleConfirmed: "ok",
      locationDispatchable: "ok",
      incidentClassified: "ok",
      coverageReviewAllowed: "ok",
      smsGenerated: "ok",
    },
    coverage: {
      evaluated: true,
      policy: "Comprehensive · POL-31204",
      rules: [
        { label: "Roadside cover active", result: "pass" },
        { label: "Annual call-out limit", result: "pass" },
        { label: "Vehicle on policy", result: "pass" },
      ],
    },
    nextAction: {
      evaluated: true,
      actionType: "Repair truck",
      provider: "Aster Mobile Technician",
      eta: "35 min",
    },
    transcript: [
      { speaker: "agent", text: "What's happened with the vehicle?", time: "13:20:11" },
      { speaker: "caller", text: "Flat tyre in the Tesco car park.", time: "13:20:18" },
    ],
    events: [
      { type: "coverage.evaluated", status: "ok", label: "Coverage approved", time: "13:21:02" },
      { type: "dispatch.requested", status: "ok", label: "Repair truck dispatched", time: "13:21:10" },
      { type: "sms.sent", status: "ok", label: "Confirmation SMS sent", time: "13:21:12" },
    ],
  },
  {
    caseRef: "AST-3E55C701",
    status: "completed",
    stage: "Dispatched",
    authMethod: "phone_match_pin",
    attentionFlags: [],
    callerPhone: "+44 7700 900 902",
    callerLabel: "Tomasz Lis",
    policyholderName: "Tomasz Lis",
    vehicleLabel: "2022 Kia Niro · LP72 TLS",
    vehicleConfirmed: true,
    incident: "Dead battery",
    location: "Home address, NW6 4QP",
    locationDispatchable: true,
    incidentClassified: true,
    elapsed: "05:44",
    lastUpdate: "41m ago",
    pinAttempts: "1 / 3",
    outcomeReason: "Repair truck dispatched.",
    smsPreview:
      "Aster Roadside: a repair truck is on the way, ETA 28 min. Track at aster.co/r/AST-3E55C701.",
    gates: {
      safetyChecked: "ok",
      identityVerified: "ok",
      vehicleConfirmed: "ok",
      locationDispatchable: "ok",
      incidentClassified: "ok",
      coverageReviewAllowed: "ok",
      smsGenerated: "ok",
    },
    coverage: {
      evaluated: true,
      policy: "Comprehensive · POL-77820",
      rules: [
        { label: "Roadside cover active", result: "pass" },
        { label: "Annual call-out limit", result: "pass" },
        { label: "Vehicle on policy", result: "pass" },
      ],
    },
    nextAction: {
      evaluated: true,
      actionType: "Repair truck",
      provider: "Aster Mobile Technician",
      eta: "28 min",
    },
    transcript: [
      { speaker: "agent", text: "What's happened?", time: "13:00:11" },
      { speaker: "caller", text: "Car won't start, battery's dead.", time: "13:00:16" },
    ],
    events: [
      { type: "coverage.evaluated", status: "ok", label: "Coverage approved", time: "13:01:02" },
      { type: "dispatch.requested", status: "ok", label: "Repair truck dispatched", time: "13:01:08" },
      { type: "sms.sent", status: "ok", label: "Confirmation SMS sent", time: "13:01:10" },
    ],
  },
  {
    caseRef: "AST-2A18B445",
    status: "needs_human_callback",
    stage: "Location",
    authMethod: "phone_match_pin",
    attentionFlags: ["location unclear"],
    callerPhone: "+44 7700 900 660",
    callerLabel: "Daniel Okafor",
    policyholderName: "Daniel Okafor",
    vehicleLabel: "2020 Toyota Yaris · LR20 DOK",
    vehicleConfirmed: true,
    incident: "Won't start",
    location: undefined,
    locationDispatchable: false,
    incidentClassified: true,
    elapsed: "04:11",
    lastUpdate: "1h ago",
    outcomeReason: "Location could not be resolved for dispatch.",
    finalAgentMessage:
      "I can't pin down your location. A human agent will call you back to confirm.",
    smsPreview:
      "Aster Roadside: an agent will call back to confirm your location. Ref AST-2A18B445.",
    gates: {
      safetyChecked: "ok",
      identityVerified: "ok",
      vehicleConfirmed: "ok",
      locationDispatchable: "blocked",
      incidentClassified: "ok",
      coverageReviewAllowed: "blocked",
      smsGenerated: "ok",
    },
    coverage: { evaluated: false, reason: "Dispatch location unresolved" },
    nextAction: { evaluated: false, reason: "Human callback to confirm location." },
    transcript: [
      { speaker: "agent", text: "Where are you?", time: "12:30:11" },
      { speaker: "caller", text: "Somewhere off the A40, I'm not sure exactly.", time: "12:30:18" },
      { speaker: "agent", text: "I can't pin down your location. A human agent will call you back to confirm.", time: "12:30:28" },
    ],
    events: [
      { type: "location.unresolved", status: "blocked", label: "Location unresolved", time: "12:30:22" },
      { type: "case.routed", status: "warn", label: "Routed to human callback", time: "12:30:30" },
      { type: "sms.sent", status: "ok", label: "Callback SMS generated", time: "12:30:32" },
    ],
  },
];
