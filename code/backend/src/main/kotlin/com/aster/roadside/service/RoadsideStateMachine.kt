package com.aster.roadside.service

import com.aster.roadside.domain.BlockedAction
import com.aster.roadside.domain.ClaimStage
import com.aster.roadside.domain.IntakeFacts
import com.aster.roadside.domain.LocationResolution
import com.aster.roadside.domain.MissingFact
import com.aster.roadside.domain.StateMachineEvaluation
import com.aster.roadside.domain.WorkflowAction
import org.springframework.stereotype.Service

@Service
class RoadsideStateMachine {
    fun evaluate(
        facts: IntakeFacts,
        locationResolution: LocationResolution?,
    ): StateMachineEvaluation =
        nextState(facts, locationResolution).toEvaluation()

    private fun nextState(
        facts: IntakeFacts,
        locationResolution: LocationResolution?,
    ): RoadsideWorkflowState =
        if (facts.callerIsPolicyholder == false) {
            RoadsideWorkflowState.HumanCallbackRequired(
                reason = "Caller is not the policyholder in the prototype.",
                missingFacts = missingFacts(facts, locationResolution),
            )
        } else when {
            isUnsafeSafetyStop(facts) ->
                RoadsideWorkflowState.Cancelled(
                    reason = "Security exit: automated intake stopped until everyone is safe.",
                )

            !facts.safetyKnown ->
                RoadsideWorkflowState.NeedsCallerInput(
                    stage = ClaimStage.SAFETY,
                    question = "Before I check cover, are you and any passengers safely away from traffic?",
                    reason = "Safety is required before coverage.",
                    missingFacts = missingFacts(facts, locationResolution),
                    blockedActions = blockedActions(facts, locationResolution),
                )

            !facts.identityConfirmed ->
                RoadsideWorkflowState.NeedsCallerInput(
                    stage = ClaimStage.VERIFY,
                    question = "Can I take your full name, date of birth, and the requested roadside PIN digits?",
                    reason = "Identity has not been verified.",
                    missingFacts = missingFacts(facts, locationResolution),
                    blockedActions = blockedActions(facts, locationResolution),
                )

            !facts.vehicleConfirmed ->
                RoadsideWorkflowState.NeedsCallerInput(
                    stage = ClaimStage.VEHICLE,
                    question = "Which vehicle are you with today?",
                    reason = "Vehicle has not been confirmed.",
                    missingFacts = missingFacts(facts, locationResolution),
                    blockedActions = blockedActions(facts, locationResolution),
                )

            !facts.locationConfirmed || locationResolution?.dispatchable != true ->
                RoadsideWorkflowState.NeedsCallerInput(
                    stage = ClaimStage.LOCATION,
                    question = locationQuestion(locationResolution),
                    reason =
                        if (locationResolution?.dispatchable == true) {
                            "Resolved location needs caller confirmation."
                        } else {
                            "Location is not dispatchable yet."
                        },
                    missingFacts = missingFacts(facts, locationResolution),
                    blockedActions = blockedActions(facts, locationResolution),
                )

            !facts.incidentKnown ->
                RoadsideWorkflowState.NeedsCallerInput(
                    stage = ClaimStage.INCIDENT,
                    question = incidentQuestion(facts),
                    reason = "Incident type is not clear enough for automated coverage.",
                    missingFacts = missingFacts(facts, locationResolution),
                    blockedActions = blockedActions(facts, locationResolution),
                )

            else ->
                RoadsideWorkflowState.ReadyForCoverageDecision(
                    reason = "Minimum intake fields are complete and dispatch location is resolvable.",
                )
        }

    private fun locationQuestion(locationResolution: LocationResolution?): String {
        val resolved =
            locationResolution
                ?.candidateAddresses
                ?.firstOrNull()
                ?.takeIf { it.isNotBlank() }
                ?: locationResolution?.formattedAddress?.takeIf { it.isNotBlank() }
        val candidates = locationResolution?.candidateAddresses.orEmpty().take(3)
        return when {
            locationResolution?.dispatchable == true && resolved != null ->
                "I found $resolved. Is that the right place?"
            candidates.size > 1 ->
                "I found a few possible matches: ${candidates.joinToString("; ")}. Which one sounds closest? If none, tell me a nearby road, shop, junction, landmark, or rough area."
            else ->
                "Where are you now? A nearby road, junction, service area, shop, landmark, or rough area is enough. A postcode is optional if you know it."
        }
    }

    private fun incidentQuestion(facts: IntakeFacts): String =
        if (facts.incidentSummary.isNullOrBlank()) {
            "What happened to the vehicle?"
        } else {
            "I want to make sure I understand the vehicle problem. Can you describe the issue another way, for example whether it is the tyre, battery, engine, keys, fuel, charging, or an accident?"
        }

    private fun missingFacts(
        facts: IntakeFacts,
        locationResolution: LocationResolution?,
    ): List<MissingFact> =
        buildList {
            if (!facts.identityConfirmed) add(MissingFact.IDENTITY)
            if (!facts.safetyKnown) add(MissingFact.SAFETY)
            if (!facts.vehicleConfirmed) add(MissingFact.VEHICLE)
            if (!facts.locationConfirmed || locationResolution?.dispatchable != true) {
                add(
                    if (locationResolution?.dispatchable == true) {
                        MissingFact.LOCATION_CONFIRMATION
                    } else {
                        MissingFact.DISPATCHABLE_LOCATION
                    },
                )
            }
            if (!facts.incidentKnown) add(MissingFact.INCIDENT)
        }

    private fun blockedActions(
        facts: IntakeFacts,
        locationResolution: LocationResolution?,
    ): List<BlockedAction> =
        buildList {
            val missing = missingFacts(facts, locationResolution)
            if (missing.isNotEmpty()) add(BlockedAction.COVERAGE_DECISION)
            if (!facts.safetyKnown || !facts.locationConfirmed || locationResolution?.dispatchable != true) {
                add(BlockedAction.DISPATCH_SIMULATION)
            }
        }

    private fun isUnsafeSafetyStop(facts: IntakeFacts): Boolean {
        if (facts.safetyKnown || facts.safetySummary.isNullOrBlank()) return false
        val text = facts.safetySummary.lowercase()
        return text.contains("safe place") ||
            text.contains("not safe") ||
            text.contains("unsafe") ||
            text.contains("move to safety") ||
            text.contains("away from traffic") ||
            text.contains("middle of the road") ||
            text.contains("in the road") ||
            text.contains("in traffic") ||
            text.contains("live traffic") ||
            text.contains("immediate danger") ||
            text.contains("emergency services") ||
            text.contains("injury") ||
            text.contains("injured") ||
            text.contains("hurt") ||
            text.contains("smoke") ||
            text.contains("fire") ||
            text.contains("flood")
    }

    private sealed interface RoadsideWorkflowState {
        fun toEvaluation(): StateMachineEvaluation

        data class NeedsCallerInput(
            val stage: ClaimStage,
            val question: String,
            val reason: String,
            val missingFacts: List<MissingFact>,
            val blockedActions: List<BlockedAction>,
        ) : RoadsideWorkflowState {
            override fun toEvaluation() =
                StateMachineEvaluation(
                    stage = stage,
                    allowedAction = WorkflowAction.ASK_QUESTION,
                    question = question,
                    reason = reason,
                    missingFacts = missingFacts,
                    blockedActions = blockedActions,
                )
        }

        data class ReadyForCoverageDecision(
            val reason: String,
        ) : RoadsideWorkflowState {
            override fun toEvaluation() =
                StateMachineEvaluation(
                    stage = ClaimStage.COVERAGE,
                    allowedAction = WorkflowAction.COVERAGE_DECISION,
                    question = null,
                    reason = reason,
                    missingFacts = emptyList(),
                    blockedActions = emptyList(),
                )
        }

        data class HumanCallbackRequired(
            val reason: String,
            val missingFacts: List<MissingFact>,
        ) : RoadsideWorkflowState {
            override fun toEvaluation() =
                StateMachineEvaluation(
                    stage = ClaimStage.SMS,
                    allowedAction = WorkflowAction.HUMAN_CALLBACK,
                    question = null,
                    reason = reason,
                    missingFacts = missingFacts,
                    blockedActions =
                        listOf(
                            BlockedAction.COVERAGE_DECISION,
                            BlockedAction.DISPATCH_SIMULATION,
                        ),
                )
        }

        data class Cancelled(
            val reason: String,
        ) : RoadsideWorkflowState {
            override fun toEvaluation() =
                StateMachineEvaluation(
                    stage = ClaimStage.CLOSED,
                    allowedAction = WorkflowAction.CANCELLED,
                    question = null,
                    reason = reason,
                    missingFacts = emptyList(),
                    blockedActions =
                        listOf(
                            BlockedAction.COVERAGE_DECISION,
                            BlockedAction.DISPATCH_SIMULATION,
                        ),
                )
        }
    }
}
