package com.aster.roadside.service

import com.aster.roadside.data.FakeRoadsideData
import com.aster.roadside.domain.ClaimStatus
import com.aster.roadside.domain.CreateClaimRequest
import com.aster.roadside.domain.UpdateFactsRequest
import com.aster.roadside.domain.VerifyKnownPinRequest
import com.aster.roadside.domain.VerifyUnknownIdentityRequest
import com.aster.roadside.domain.WorkflowAction
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.mock.env.MockEnvironment

class ClaimServiceIntegrationTest {
    @Test
    fun `known policyholder correct PIN verifies identity and returns customer details`() {
        val service = claimService()
        val claim = service.createClaim(CreateClaimRequest(callerPhoneNumber = MAYA_PHONE))

        val response = service.verifyKnownPin(claim.identity.id, correctKnownPinRequest(claim.identity.customerId!!))
        val updated = service.getClaim(claim.identity.id)

        assertThat(response.verified).isTrue()
        assertThat(response.policyholderName).isEqualTo("Maya Thompson")
        assertThat(response.customerDetails?.name).isEqualTo("Maya Thompson")
        assertThat(response.vehicleOptions).hasSize(1)
        assertThat(response.humanCallbackRequired).isFalse()
        assertThat(response.cancellationRequired).isFalse()
        assertThat(updated.intakeFacts.identityConfirmed).isTrue()
        assertThat(updated.intakeFacts.safetyKnown).isTrue()
        assertThat(updated.workflow.status).isEqualTo(ClaimStatus.IN_PROGRESS)
    }

    @Test
    fun `known policyholder wrong PIN retries twice then cancels without SMS`() {
        val service = claimService()
        val claim = service.createClaim(CreateClaimRequest(callerPhoneNumber = MAYA_PHONE))
        val wrongPin = VerifyKnownPinRequest(firstDigit = 0, secondDigit = 0)

        val first = service.verifyKnownPin(claim.identity.id, wrongPin)
        val second = service.verifyKnownPin(claim.identity.id, wrongPin)
        val third = service.verifyKnownPin(claim.identity.id, wrongPin)
        val cancelled = service.getClaim(claim.identity.id)

        assertThat(first.verified).isFalse()
        assertThat(first.attemptsRemaining).isEqualTo(2)
        assertThat(first.nextStep.allowedAction).isEqualTo(WorkflowAction.RETRY_PIN)
        assertThat(second.attemptsRemaining).isEqualTo(1)
        assertThat(second.nextStep.allowedAction).isEqualTo(WorkflowAction.RETRY_PIN)
        assertThat(third.verified).isFalse()
        assertThat(third.attemptsRemaining).isZero()
        assertThat(third.humanCallbackRequired).isFalse()
        assertThat(third.cancellationRequired).isTrue()
        assertThat(third.nextStep.allowedAction).isEqualTo(WorkflowAction.CANCELLED)
        assertThat(cancelled.workflow.status).isEqualTo(ClaimStatus.CANCELLED)
        assertThat(cancelled.artifacts.smsPreview).isNull()
        assertThat(cancelled.artifacts.coverageDecision?.escalationRequired).isFalse()
    }

    @Test
    fun `unknown-number caller verifies with name birthdate and requested PIN digits`() {
        val service = claimService()
        val claim = service.createClaim(CreateClaimRequest(callerPhoneNumber = "+447700999999"))

        val response =
            service.verifyUnknownIdentity(
                claim.identity.id,
                VerifyUnknownIdentityRequest(
                    name = "Alex Carter",
                    birthDate = "1988-02-19",
                    firstDigit = 5,
                    secondDigit = 2,
                ),
            )
        val updated = service.getClaim(claim.identity.id)

        assertThat(response.verified).isTrue()
        assertThat(response.customerDetails?.name).isEqualTo("Alex Carter")
        assertThat(updated.identity.customerId).isEqualTo("cust-011")
        assertThat(updated.intakeFacts.identityConfirmed).isTrue()
        assertThat(updated.authentication.pinVerificationAttempts).isZero()
    }

    @Test
    fun `unsafe caller cancels intake and skips SMS`() {
        val service = claimService()
        val claim = service.createClaim(CreateClaimRequest(callerPhoneNumber = MAYA_PHONE))

        val cancelled =
            service.updateFacts(
                claim.identity.id,
                UpdateFactsRequest(safetySummary = "No, I am in the middle of the road and not away from traffic."),
            )

        assertThat(cancelled.workflow.status).isEqualTo(ClaimStatus.CANCELLED)
        assertThat(cancelled.artifacts.smsPreview).isNull()
        assertThat(cancelled.artifacts.coverageDecision?.rationale).contains("Security exit")
        assertThat(cancelled.auditEvents.map { it.type }).contains("case.cancelled", "sms.skipped")
    }

    @Test
    fun `covered flat tyre completes with repair truck SMS`() {
        val service = claimService()
        val claim = service.createClaim(CreateClaimRequest(callerPhoneNumber = MAYA_PHONE))
        service.verifyKnownPin(claim.identity.id, correctKnownPinRequest(claim.identity.customerId!!))

        completeIntake(
            service = service,
            claimId = claim.identity.id,
            vehicleId = "veh-005-a",
            location = "Beaconsfield Services",
            incidentSummary = "I have a flat tyre",
        )
        val completed = service.finalizeClaim(claim.identity.id)

        assertThat(completed.workflow.status).isEqualTo(ClaimStatus.COMPLETED)
        assertThat(completed.artifacts.coverageDecision?.covered).isTrue()
        assertThat(completed.artifacts.assistanceAction?.actionType?.wireValue).isEqualTo("repair_truck")
        assertThat(completed.artifacts.smsPreview).contains("Aster Mobile Technician")
        assertThat(completed.artifacts.smsPreview).contains("ETA 35 min")
    }

    @Test
    fun `not covered incident completes as not covered with no dispatch`() {
        val service = claimService()
        val claim = service.createClaim(CreateClaimRequest(callerPhoneNumber = JAMES_PHONE))
        service.verifyKnownPin(claim.identity.id, correctKnownPinRequest(claim.identity.customerId!!))

        completeIntake(
            service = service,
            claimId = claim.identity.id,
            vehicleId = "veh-002-a",
            location = "Beaconsfield Services",
            incidentSummary = "The engine cut out",
        )
        val completed = service.finalizeClaim(claim.identity.id)

        assertThat(completed.workflow.status).isEqualTo(ClaimStatus.NOT_COVERED)
        assertThat(completed.artifacts.coverageDecision?.covered).isFalse()
        assertThat(completed.artifacts.assistanceAction).isNull()
        assertThat(completed.artifacts.smsPreview).contains("not covered by your policy")
        assertThat(completed.artifacts.smsPreview).contains("No truck has been dispatched")
    }

    @Test
    fun `EV warning routes to human callback and sends callback SMS`() {
        val service = claimService()
        val claim = service.createClaim(CreateClaimRequest(callerPhoneNumber = SOFIA_PHONE))
        service.verifyKnownPin(claim.identity.id, correctKnownPinRequest(claim.identity.customerId!!))

        completeIntake(
            service = service,
            claimId = claim.identity.id,
            vehicleId = "veh-007-a",
            location = "Cabot Circus Bristol",
            incidentSummary = "There is a red EV battery warning light",
        )
        val completed = service.finalizeClaim(claim.identity.id)

        assertThat(completed.workflow.status).isEqualTo(ClaimStatus.NEEDS_HUMAN_CALLBACK)
        assertThat(completed.artifacts.coverageDecision?.escalationRequired).isTrue()
        assertThat(completed.artifacts.assistanceAction).isNull()
        assertThat(completed.artifacts.smsPreview).contains("roadside specialist")
    }

    @Test
    fun `transcripts and tool calls are persisted and deduplicated`() {
        val service = claimService()
        val claim = service.createClaim(CreateClaimRequest(callerPhoneNumber = MAYA_PHONE))

        service.appendTranscript(claim.identity.id, "agent", "Is everyone safe?")
        service.appendTranscript(claim.identity.id, "agent", "Is everyone safe?")
        service.appendToolCallTrace(
            claim.identity.id,
            com.aster.roadside.domain.AppendToolCallTraceRequest(
                toolName = "verify_known_pin",
                callId = "call-1",
                resultSummary = mapOf("verified" to true),
            ),
        )
        service.appendToolCallTrace(
            claim.identity.id,
            com.aster.roadside.domain.AppendToolCallTraceRequest(
                toolName = "verify_known_pin",
                callId = "call-1",
                resultSummary = mapOf("verified" to true),
            ),
        )
        val updated = service.getClaim(claim.identity.id)

        assertThat(updated.transcript).hasSize(1)
        assertThat(updated.toolCalls).hasSize(1)
        assertThat(updated.toolCalls.single().toolName).isEqualTo("verify_known_pin")
    }

    private fun completeIntake(
        service: ClaimService,
        claimId: String,
        vehicleId: String,
        location: String,
        incidentSummary: String,
    ) {
        service.updateFacts(
            claimId,
            UpdateFactsRequest(vehicleConfirmed = true, selectedVehicleId = vehicleId),
        )
        val withLocation =
            service.updateFacts(
                claimId,
                UpdateFactsRequest(location = location, locationVerifiedByCaller = true),
            )
        assertThat(withLocation.intakeFacts.locationConfirmed).isTrue()

        val withIncident =
            service.updateFacts(
                claimId,
                UpdateFactsRequest(incidentSummary = incidentSummary),
            )
        assertThat(withIncident.intakeFacts.incidentKnown).isTrue()
        assertThat(service.nextStep(claimId).allowedAction).isEqualTo(WorkflowAction.COVERAGE_DECISION)
    }

    private fun claimService(): ClaimService {
        val environment = MockEnvironment()
        val locationLookupService = LocationLookupService(GoogleMapsLocationClient(environment))
        return ClaimService(
            stateMachine = RoadsideStateMachine(),
            locationLookupService = locationLookupService,
            incidentClassifier = DeterministicIncidentClassifier(),
            coverageDecisionService = CoverageDecisionService(locationLookupService),
        )
    }

    private fun correctKnownPinRequest(customerId: String): VerifyKnownPinRequest {
        val customer = FakeRoadsideData.customers.single { it.id == customerId }
        val claim = claimService().createClaim(CreateClaimRequest(customer.phoneNumber))
        val digits =
            claim.authentication.pinChallengePositions
                .map { customer.roadsidePin[it - 1].digitToInt() }
        return VerifyKnownPinRequest(firstDigit = digits[0], secondDigit = digits[1])
    }

    private class DeterministicIncidentClassifier : IncidentClassifier(MockEnvironment()) {
        override fun classify(summary: String): String? {
            val text = summary.lowercase()
            return when {
                "flat" in text || "tyre" in text || "tire" in text || "puncture" in text -> "flat_tire"
                "engine" in text -> "engine_failure"
                "battery warning" in text || "ev" in text -> "ev_warning"
                "battery" in text -> "dead_battery"
                else -> null
            }
        }
    }

    private companion object {
        const val MAYA_PHONE = "+447700900105"
        const val JAMES_PHONE = "+447700900102"
        const val SOFIA_PHONE = "+447700900107"
    }
}
