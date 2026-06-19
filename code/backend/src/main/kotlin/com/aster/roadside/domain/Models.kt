package com.aster.roadside.domain

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

enum class ClaimStage(val label: String) {
    LOOKUP("Lookup"),
    VERIFY("Verify"),
    SAFETY("Safety"),
    VEHICLE("Vehicle"),
    LOCATION("Location"),
    INCIDENT("Incident"),
    COVERAGE("Coverage"),
    ACTION("Action"),
    SMS("SMS"),
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
    val actionType: String,
    val etaMinutes: Int,
    val rationale: String,
)

data class StateMachineEvaluation(
    val stage: ClaimStage,
    val allowedAction: String,
    val question: String?,
    val reason: String,
    val missingFacts: List<String>,
    val blockedActions: List<String>,
)

data class CoverageDecision(
    val covered: Boolean,
    val confidence: Double,
    val rationale: String,
    val escalationRequired: Boolean,
)

data class AssistanceAction(
    val actionType: String,
    val providerName: String,
    val etaMinutes: Int,
    val customerMessage: String,
)

data class ClaimSession(
    val id: String,
    val callerPhoneNumber: String,
    val customerId: String?,
    val scenarioId: String?,
    val authMode: AuthMode,
    val authRisk: AuthRisk,
    val status: ClaimStatus,
    val stage: String,
    val intakeFacts: IntakeFacts,
    val missingFacts: List<String>,
    val blockedActions: List<String>,
    val pinChallengePositions: List<Int>,
    val pinVerificationAttempts: Int = 0,
    val locationResolution: LocationResolution?,
    val providerMatch: ProviderMatch?,
    val stateEvaluation: StateMachineEvaluation?,
    val coverageDecision: CoverageDecision?,
    val assistanceAction: AssistanceAction?,
    val smsPreview: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
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

data class AuthVerificationResponse(
    val verified: Boolean,
    val reason: String,
    val authRisk: AuthRisk,
    val policyholderName: String?,
    val customerDetails: VerifiedCustomerDetails?,
    val pinChallengePositions: List<Int>,
    val attemptsRemaining: Int,
    val humanCallbackRequired: Boolean,
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
    val allowedAction: String,
    val question: String?,
    val reason: String,
    val blockedActions: List<String>,
)
