package com.aster.roadside.domain

import com.fasterxml.jackson.annotation.JsonValue
import java.time.Instant

data class Customer(
    val id: String,
    val demoLabel: String,
    val name: String,
    val birthDate: String,
    val phoneNumber: String,
    val roadsidePin: String,
    val homePostcode: String,
    val preferredContact: String,
    val vehicles: List<Vehicle>,
)

data class Vehicle(
    val id: String,
    val registration: String,
    val make: String,
    val model: String,
    val year: Int,
    val colour: String,
    val fuelType: String,
    val policyId: String,
)

data class Policy(
    val id: String,
    val name: String,
    val summary: String,
    val coverageTier: String,
    val coveredEvents: List<String>,
    val assistanceBenefits: Map<String, Boolean>,
    val limits: Map<String, Int>,
    val exclusions: List<String>,
    val escalationRules: List<String>,
)

data class Scenario(
    val id: String,
    val label: String,
    val callerPrompt: String,
    val issueType: String,
    val locationPrompt: String,
    val safetyPrompt: String,
    val expectedOutcome: String,
    val recommendedVehicleTypes: List<String>,
)

enum class ClaimStatus {
    CREATED,
    IN_PROGRESS,
    NEEDS_HUMAN_CALLBACK,
    CANCELLED,
    NOT_COVERED,
    COMPLETED,
}

enum class AuthMode {
    KNOWN_NUMBER_SIMULATED,
    FALLBACK_SIMULATED,
}

enum class AuthRisk {
    STANDARD,
    ELEVATED,
}

enum class ClaimStage(
    @get:JsonValue val label: String,
) {
    LOOKUP("Lookup"),
    VERIFY("Verify"),
    SAFETY("Safety"),
    VEHICLE("Vehicle"),
    LOCATION("Location"),
    INCIDENT("Incident"),
    COVERAGE("Coverage"),
    ACTION("Action"),
    SMS("SMS"),
    CLOSED("Closed"),
}

enum class WorkflowAction(
    @get:JsonValue val wireValue: String,
) {
    ASK_QUESTION("ask_question"),
    COVERAGE_DECISION("coverage_decision"),
    HUMAN_CALLBACK("human_callback"),
    CANCELLED("cancelled"),
    RETRY_PIN("retry_pin"),
}

enum class BlockedAction(
    @get:JsonValue val wireValue: String,
) {
    COVERAGE_DECISION("coverage_decision"),
    DISPATCH_SIMULATION("dispatch_simulation"),
}

enum class MissingFact(
    @get:JsonValue val wireValue: String,
) {
    IDENTITY("identity"),
    SAFETY("safety"),
    VEHICLE("vehicle"),
    LOCATION_CONFIRMATION("location_confirmation"),
    DISPATCHABLE_LOCATION("dispatchable_location"),
    INCIDENT("incident"),
}

enum class AssistanceActionType(
    @get:JsonValue val wireValue: String,
) {
    REPAIR_TRUCK("repair_truck"),
    TOW_TRUCK("tow_truck"),
}

enum class IncidentType(
    @get:JsonValue val wireValue: String,
    val displayName: String,
    val dispatchAction: AssistanceActionType,
) {
    FLAT_TIRE("flat_tire", "a flat tyre", AssistanceActionType.REPAIR_TRUCK),
    DEAD_BATTERY("dead_battery", "a dead battery", AssistanceActionType.REPAIR_TRUCK),
    ENGINE_FAILURE("engine_failure", "engine failure", AssistanceActionType.TOW_TRUCK),
    LOST_KEYS("lost_keys", "lost keys", AssistanceActionType.TOW_TRUCK),
    FUEL_ISSUE("fuel_issue", "a fuel issue", AssistanceActionType.TOW_TRUCK),
    EV_BATTERY_DEPLETED("ev_battery_depleted", "a depleted EV battery", AssistanceActionType.TOW_TRUCK),
    CHARGING_STATION_FAILURE("charging_station_failure", "charging station failure", AssistanceActionType.TOW_TRUCK),
    MINOR_MECHANICAL_FAULT("minor_mechanical_fault", "a minor mechanical fault", AssistanceActionType.REPAIR_TRUCK),
    ACCIDENT_WITH_INJURY("accident_with_injury", "an accident with injury", AssistanceActionType.TOW_TRUCK),
    THIRD_PARTY_CALLER("third_party_caller", "a third-party caller", AssistanceActionType.TOW_TRUCK),
    EV_WARNING("ev_warning", "an EV warning light", AssistanceActionType.TOW_TRUCK),
    SOFTWARE_LOCKOUT("software_lockout", "a software lockout", AssistanceActionType.TOW_TRUCK),
    BREAKDOWN_OUTSIDE_UK("breakdown_outside_uk", "a breakdown outside the UK", AssistanceActionType.TOW_TRUCK),
    UNKNOWN("unknown", "the reported incident", AssistanceActionType.TOW_TRUCK),
    ;

    val requiresHumanCallback: Boolean
        get() = this in setOf(ACCIDENT_WITH_INJURY, THIRD_PARTY_CALLER, EV_WARNING)

    companion object {
        fun fromWireValue(value: String): IncidentType =
            entries.firstOrNull { it.wireValue == value } ?: UNKNOWN
    }
}

data class IntakeFacts(
    val identityConfirmed: Boolean = false,
    val vehicleConfirmed: Boolean = false,
    val locationConfirmed: Boolean = false,
    val safetyKnown: Boolean = false,
    val incidentKnown: Boolean = false,
    val callerIsPolicyholder: Boolean? = null,
    val selectedVehicleId: String? = null,
    val location: String? = null,
    val issueType: String? = null,
    val incidentSummary: String? = null,
    val safetySummary: String? = null,
)

data class LocationResolution(
    val rawLocation: String,
    val normalizedArea: String,
    val dispatchable: Boolean,
    val confidence: Double,
    val rationale: String,
    val formattedAddress: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val googleMapsUri: String? = null,
    val placeId: String? = null,
    val candidateAddresses: List<String> = emptyList(),
    val source: String = "synthetic",
    val requiresCallerConfirmation: Boolean = false,
)

data class ProviderMatch(
    val providerName: String,
    val actionType: AssistanceActionType,
    val etaMinutes: Int,
    val rationale: String,
)

data class StateMachineEvaluation(
    val stage: ClaimStage,
    val allowedAction: WorkflowAction,
    val question: String?,
    val reason: String,
    val missingFacts: List<MissingFact>,
    val blockedActions: List<BlockedAction>,
)

data class CoverageDecision(
    val covered: Boolean,
    val confidence: Double,
    val rationale: String,
    val escalationRequired: Boolean,
)

data class AssistanceAction(
    val actionType: AssistanceActionType,
    val providerName: String,
    val etaMinutes: Int,
    val customerMessage: String,
)

data class ClaimIdentity(
    val id: String,
    val callerPhoneNumber: String,
    val customerId: String?,
    val scenarioId: String?,
)

data class ClaimAuthentication(
    val authMode: AuthMode,
    val authRisk: AuthRisk,
    val pinChallengePositions: List<Int>,
    val pinVerificationAttempts: Int = 0,
)

sealed interface ClaimWorkflow {
    val status: ClaimStatus
    val stage: ClaimStage
    val missingFacts: List<MissingFact>
    val blockedActions: List<BlockedAction>
    val stateEvaluation: StateMachineEvaluation?

    data class Intake(
        override val status: ClaimStatus,
        override val stage: ClaimStage,
        override val missingFacts: List<MissingFact>,
        override val blockedActions: List<BlockedAction>,
        override val stateEvaluation: StateMachineEvaluation?,
    ) : ClaimWorkflow {
        init {
            require(status == ClaimStatus.CREATED || status == ClaimStatus.IN_PROGRESS) {
                "Intake workflow can only be created or in progress."
            }
        }
    }

    data class HumanCallback(
        override val stage: ClaimStage,
        override val missingFacts: List<MissingFact>,
        override val blockedActions: List<BlockedAction>,
        override val stateEvaluation: StateMachineEvaluation?,
    ) : ClaimWorkflow {
        override val status = ClaimStatus.NEEDS_HUMAN_CALLBACK
    }

    data class Cancelled(
        override val stage: ClaimStage = ClaimStage.CLOSED,
        override val stateEvaluation: StateMachineEvaluation?,
    ) : ClaimWorkflow {
        override val status = ClaimStatus.CANCELLED
        override val missingFacts = emptyList<MissingFact>()
        override val blockedActions = emptyList<BlockedAction>()
    }

    data class NotCovered(
        override val stage: ClaimStage = ClaimStage.SMS,
        override val stateEvaluation: StateMachineEvaluation?,
    ) : ClaimWorkflow {
        override val status = ClaimStatus.NOT_COVERED
        override val missingFacts = emptyList<MissingFact>()
        override val blockedActions = emptyList<BlockedAction>()
    }

    data class Completed(
        override val stage: ClaimStage = ClaimStage.SMS,
        override val stateEvaluation: StateMachineEvaluation?,
    ) : ClaimWorkflow {
        override val status = ClaimStatus.COMPLETED
        override val missingFacts = emptyList<MissingFact>()
        override val blockedActions = emptyList<BlockedAction>()
    }
}

data class ClaimArtifacts(
    val locationResolution: LocationResolution?,
    val providerMatch: ProviderMatch?,
    val coverageDecision: CoverageDecision?,
    val assistanceAction: AssistanceAction?,
    val smsPreview: String?,
)

data class ClaimSession(
    val identity: ClaimIdentity,
    val authentication: ClaimAuthentication,
    val intakeFacts: IntakeFacts,
    val workflow: ClaimWorkflow,
    val artifacts: ClaimArtifacts,
    val createdAt: Instant,
    val updatedAt: Instant,
    val transcript: List<TranscriptTurn> = emptyList(),
    val auditEvents: List<ClaimAuditEvent> = emptyList(),
    val toolCalls: List<ToolCallTrace> = emptyList(),
)

data class TranscriptTurn(
    val speaker: String,
    val text: String,
    val createdAt: Instant,
)

data class ClaimAuditEvent(
    val type: String,
    val status: String,
    val label: String,
    val createdAt: Instant,
)

data class ToolCallTrace(
    val toolName: String,
    val callId: String,
    val status: String,
    val argumentsSummary: Map<String, Any?>,
    val resultSummary: Map<String, Any?>,
    val createdAt: Instant,
)

data class CreateClaimRequest(
    val callerPhoneNumber: String,
    val scenarioId: String? = null,
    val selectedVehicleId: String? = null,
    val callerIsPolicyholder: Boolean? = true,
)

data class UpdateFactsRequest(
    val identityConfirmed: Boolean? = null,
    val vehicleConfirmed: Boolean? = null,
    val locationConfirmed: Boolean? = null,
    val safetyKnown: Boolean? = null,
    val incidentKnown: Boolean? = null,
    val callerIsPolicyholder: Boolean? = null,
    val selectedVehicleId: String? = null,
    val location: String? = null,
    val locationVerifiedByCaller: Boolean? = null,
    val issueType: String? = null,
    val incidentSummary: String? = null,
    val safetySummary: String? = null,
)

data class VerifyKnownPinRequest(
    val firstDigit: Int,
    val secondDigit: Int,
)

data class VerifyUnknownIdentityRequest(
    val name: String,
    val birthDate: String,
    val firstDigit: Int,
    val secondDigit: Int,
)

data class HumanCallbackRequest(
    val reason: String = "Caller was routed to human callback.",
)

data class CancellationRequest(
    val reason: String = "Call cancelled.",
)

data class AppendTranscriptRequest(
    val speaker: String,
    val text: String,
)

data class AppendToolCallTraceRequest(
    val toolName: String,
    val callId: String,
    val status: String = "ok",
    val argumentsSummary: Map<String, Any?> = emptyMap(),
    val resultSummary: Map<String, Any?> = emptyMap(),
)

data class AuthVerificationResponse(
    val verified: Boolean,
    val reason: String,
    val authRisk: AuthRisk,
    val policyholderName: String?,
    val customerDetails: VerifiedCustomerDetails?,
    val pinChallengePositions: List<Int>,
    val attemptsRemaining: Int,
    val humanCallbackRequired: Boolean,
    val cancellationRequired: Boolean,
    val vehicleOptions: List<String>,
    val nextStep: NextStepResponse,
)

data class VerifiedCustomerDetails(
    val id: String,
    val name: String,
    val birthDate: String,
    val phoneNumber: String,
    val homePostcode: String,
    val preferredContact: String,
    val vehicles: List<VerifiedVehicleDetails>,
)

data class VerifiedVehicleDetails(
    val id: String,
    val registration: String,
    val make: String,
    val model: String,
    val year: Int,
    val colour: String,
    val fuelType: String,
    val policyId: String,
)

data class NextStepResponse(
    val allowedAction: WorkflowAction,
    val question: String?,
    val reason: String,
    val blockedActions: List<BlockedAction>,
)
