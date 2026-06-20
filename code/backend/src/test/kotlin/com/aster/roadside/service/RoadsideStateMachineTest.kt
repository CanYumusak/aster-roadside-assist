package com.aster.roadside.service

import com.aster.roadside.domain.BlockedAction
import com.aster.roadside.domain.ClaimStage
import com.aster.roadside.domain.IntakeFacts
import com.aster.roadside.domain.LocationResolution
import com.aster.roadside.domain.MissingFact
import com.aster.roadside.domain.WorkflowAction
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class RoadsideStateMachineTest {
    private val stateMachine = RoadsideStateMachine()

    @Test
    fun `unsafe caller cancels before any other intake step`() {
        val evaluation =
            stateMachine.evaluate(
                IntakeFacts(safetySummary = "I am in the middle of the road with traffic around me."),
                null,
            )

        assertThat(evaluation.stage).isEqualTo(ClaimStage.CLOSED)
        assertThat(evaluation.allowedAction).isEqualTo(WorkflowAction.CANCELLED)
        assertThat(evaluation.question).isNull()
        assertThat(evaluation.missingFacts).isEmpty()
        assertThat(evaluation.blockedActions).containsExactly(
            BlockedAction.COVERAGE_DECISION,
            BlockedAction.DISPATCH_SIMULATION,
        )
    }

    @Test
    fun `third party caller routes to human callback`() {
        val evaluation =
            stateMachine.evaluate(
                IntakeFacts(callerIsPolicyholder = false),
                null,
            )

        assertThat(evaluation.stage).isEqualTo(ClaimStage.SMS)
        assertThat(evaluation.allowedAction).isEqualTo(WorkflowAction.HUMAN_CALLBACK)
        assertThat(evaluation.question).isNull()
        assertThat(evaluation.missingFacts).contains(
            MissingFact.IDENTITY,
            MissingFact.SAFETY,
            MissingFact.VEHICLE,
            MissingFact.DISPATCHABLE_LOCATION,
            MissingFact.INCIDENT,
        )
    }

    @Test
    fun `safety is the first required step for normal callers`() {
        val evaluation = stateMachine.evaluate(IntakeFacts(), null)

        assertThat(evaluation.stage).isEqualTo(ClaimStage.SAFETY)
        assertThat(evaluation.allowedAction).isEqualTo(WorkflowAction.ASK_QUESTION)
        assertThat(evaluation.question).contains("safely away from traffic")
        assertThat(evaluation.missingFacts).containsExactly(
            MissingFact.IDENTITY,
            MissingFact.SAFETY,
            MissingFact.VEHICLE,
            MissingFact.DISPATCHABLE_LOCATION,
            MissingFact.INCIDENT,
        )
    }

    @Test
    fun `identity is required after safety`() {
        val evaluation = stateMachine.evaluate(IntakeFacts(safetyKnown = true), null)

        assertThat(evaluation.stage).isEqualTo(ClaimStage.VERIFY)
        assertThat(evaluation.allowedAction).isEqualTo(WorkflowAction.ASK_QUESTION)
        assertThat(evaluation.missingFacts).contains(MissingFact.IDENTITY)
        assertThat(evaluation.missingFacts).doesNotContain(MissingFact.SAFETY)
    }

    @Test
    fun `vehicle is required after identity`() {
        val evaluation =
            stateMachine.evaluate(
                IntakeFacts(safetyKnown = true, identityConfirmed = true),
                null,
            )

        assertThat(evaluation.stage).isEqualTo(ClaimStage.VEHICLE)
        assertThat(evaluation.allowedAction).isEqualTo(WorkflowAction.ASK_QUESTION)
        assertThat(evaluation.missingFacts).contains(MissingFact.VEHICLE)
        assertThat(evaluation.missingFacts).doesNotContain(MissingFact.IDENTITY)
    }

    @Test
    fun `location is required after vehicle`() {
        val evaluation =
            stateMachine.evaluate(
                IntakeFacts(safetyKnown = true, identityConfirmed = true, vehicleConfirmed = true),
                null,
            )

        assertThat(evaluation.stage).isEqualTo(ClaimStage.LOCATION)
        assertThat(evaluation.allowedAction).isEqualTo(WorkflowAction.ASK_QUESTION)
        assertThat(evaluation.missingFacts).contains(MissingFact.DISPATCHABLE_LOCATION)
        assertThat(evaluation.blockedActions).contains(
            BlockedAction.COVERAGE_DECISION,
            BlockedAction.DISPATCH_SIMULATION,
        )
    }

    @Test
    fun `ambiguous location asks caller to choose a candidate`() {
        val evaluation =
            stateMachine.evaluate(
                IntakeFacts(
                    safetyKnown = true,
                    identityConfirmed = true,
                    vehicleConfirmed = true,
                    locationConfirmed = false,
                ),
                LocationResolution(
                    rawLocation = "Tesco Wimbledon",
                    normalizedArea = "Multiple Google Maps matches",
                    dispatchable = false,
                    confidence = 0.58,
                    rationale = "Ambiguous",
                    candidateAddresses = listOf("Tesco Express, Wimbledon", "Tesco Extra, New Malden"),
                ),
            )

        assertThat(evaluation.stage).isEqualTo(ClaimStage.LOCATION)
        assertThat(evaluation.question).contains("I found a few possible matches")
        assertThat(evaluation.question).contains("Tesco Express")
    }

    @Test
    fun `dispatchable but unconfirmed location asks for confirmation`() {
        val evaluation =
            stateMachine.evaluate(
                IntakeFacts(
                    safetyKnown = true,
                    identityConfirmed = true,
                    vehicleConfirmed = true,
                    locationConfirmed = false,
                ),
                dispatchableLocation(),
            )

        assertThat(evaluation.stage).isEqualTo(ClaimStage.LOCATION)
        assertThat(evaluation.missingFacts).containsExactly(
            MissingFact.LOCATION_CONFIRMATION,
            MissingFact.INCIDENT,
        )
        assertThat(evaluation.question).contains("Is that the right place")
    }

    @Test
    fun `incident is required after confirmed dispatchable location`() {
        val evaluation =
            stateMachine.evaluate(
                IntakeFacts(
                    safetyKnown = true,
                    identityConfirmed = true,
                    vehicleConfirmed = true,
                    locationConfirmed = true,
                ),
                dispatchableLocation(),
            )

        assertThat(evaluation.stage).isEqualTo(ClaimStage.INCIDENT)
        assertThat(evaluation.allowedAction).isEqualTo(WorkflowAction.ASK_QUESTION)
        assertThat(evaluation.missingFacts).containsExactly(MissingFact.INCIDENT)
        assertThat(evaluation.question).isEqualTo("What happened to the vehicle?")
    }

    @Test
    fun `unclear incident summary asks for a different description`() {
        val evaluation =
            stateMachine.evaluate(
                IntakeFacts(
                    safetyKnown = true,
                    identityConfirmed = true,
                    vehicleConfirmed = true,
                    locationConfirmed = true,
                    incidentSummary = "it is broken",
                ),
                dispatchableLocation(),
            )

        assertThat(evaluation.stage).isEqualTo(ClaimStage.INCIDENT)
        assertThat(evaluation.question).contains("describe the issue another way")
    }

    @Test
    fun `complete intake allows coverage decision and unblocks dispatch simulation`() {
        val evaluation =
            stateMachine.evaluate(
                IntakeFacts(
                    safetyKnown = true,
                    identityConfirmed = true,
                    vehicleConfirmed = true,
                    locationConfirmed = true,
                    incidentKnown = true,
                    issueType = "flat_tire",
                ),
                dispatchableLocation(),
            )

        assertThat(evaluation.stage).isEqualTo(ClaimStage.COVERAGE)
        assertThat(evaluation.allowedAction).isEqualTo(WorkflowAction.COVERAGE_DECISION)
        assertThat(evaluation.question).isNull()
        assertThat(evaluation.missingFacts).isEmpty()
        assertThat(evaluation.blockedActions).isEmpty()
    }

    private fun dispatchableLocation() =
        LocationResolution(
            rawLocation = "Beaconsfield Services",
            normalizedArea = "Beaconsfield",
            dispatchable = true,
            confidence = 0.9,
            rationale = "Resolved",
            formattedAddress = "Beaconsfield Services, Windsor Road, Beaconsfield",
        )
}
