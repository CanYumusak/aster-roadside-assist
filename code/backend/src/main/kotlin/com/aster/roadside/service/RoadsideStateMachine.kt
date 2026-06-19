package com.aster.roadside.service

import com.aster.roadside.domain.ClaimStage
import com.aster.roadside.domain.IntakeFacts
import com.aster.roadside.domain.LocationResolution
import com.aster.roadside.domain.StateMachineEvaluation
import org.springframework.stereotype.Service

@Service
class RoadsideStateMachine {
    fun evaluate(
        facts: IntakeFacts,
        locationResolution: LocationResolution?,
    ): StateMachineEvaluation {
        if (facts.callerIsPolicyholder == false) {
            return StateMachineEvaluation(
                stage = ClaimStage.SMS,
                allowedAction = "human_callback",
                question = null,
                reason = "Caller is not the policyholder in the prototype.",
                missingFacts = missingFacts(facts, locationResolution),
                blockedActions = listOf("coverage_decision", "dispatch_simulation"),
            )
        }

        return when {
            !facts.safetyKnown ->
                ask(
                    stage = ClaimStage.SAFETY,
                    question = "Before I check cover, are you and any passengers safely away from traffic?",
                    reason = "Safety is required before coverage.",
                    facts = facts,
                    locationResolution = locationResolution,
                )

            !facts.identityConfirmed ->
                ask(
                    stage = ClaimStage.VERIFY,
                    question = "Can I take your full name, date of birth, and the requested roadside PIN digits?",
                    reason = "Identity has not been verified.",
                    facts = facts,
                    locationResolution = locationResolution,
                )

            !facts.vehicleConfirmed ->
                ask(
                    stage = ClaimStage.VEHICLE,
                    question = "Which vehicle are you with today?",
                    reason = "Vehicle has not been confirmed.",
                    facts = facts,
                    locationResolution = locationResolution,
                )

            !facts.locationConfirmed || locationResolution?.dispatchable != true ->
                ask(
                    stage = ClaimStage.LOCATION,
                    question = locationQuestion(locationResolution),
                    reason =
                        if (locationResolution?.dispatchable == true) {
                            "Resolved location needs caller confirmation."
                        } else {
                            "Location is not dispatchable yet."
                        },
                    facts = facts,
                    locationResolution = locationResolution,
                )

            !facts.incidentKnown ->
                ask(
                    stage = ClaimStage.INCIDENT,
                    question = incidentQuestion(facts),
                    reason = "Incident type is not clear enough for automated coverage.",
                    facts = facts,
                    locationResolution = locationResolution,
                )

            else ->
                StateMachineEvaluation(
                    stage = ClaimStage.COVERAGE,
                    allowedAction = "coverage_decision",
                    question = null,
                    reason = "Minimum intake fields are complete and dispatch location is resolvable.",
                    missingFacts = emptyList(),
                    blockedActions = emptyList(),
                )
        }
    }

    private fun ask(
        stage: ClaimStage,
        question: String,
        reason: String,
        facts: IntakeFacts,
        locationResolution: LocationResolution?,
    ) = StateMachineEvaluation(
        stage = stage,
        allowedAction = "ask_question",
        question = question,
        reason = reason,
        missingFacts = missingFacts(facts, locationResolution),
        blockedActions = blockedActions(facts, locationResolution),
    )

    private fun locationQuestion(locationResolution: LocationResolution?): String {
        val resolved = locationResolution?.formattedAddress?.takeIf { it.isNotBlank() }
        val candidates = locationResolution?.candidateAddresses.orEmpty().take(3)
        return when {
            locationResolution?.dispatchable == true && resolved != null ->
                "I found $resolved. Is that where you are?"
            candidates.size > 1 ->
                "I found several possible matches. Can you give me the street name, postcode, nearby junction, or another landmark?"
            else ->
                "Where are you now? Please include road, direction, junction, landmark, or postcode."
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
    ): List<String> =
        buildList {
            if (!facts.identityConfirmed) add("identity")
            if (!facts.safetyKnown) add("safety")
            if (!facts.vehicleConfirmed) add("vehicle")
            if (!facts.locationConfirmed || locationResolution?.dispatchable != true) {
                add(if (locationResolution?.dispatchable == true) "location_confirmation" else "dispatchable_location")
            }
            if (!facts.incidentKnown) add("incident")
        }

    private fun blockedActions(
        facts: IntakeFacts,
        locationResolution: LocationResolution?,
    ): List<String> =
        buildList {
            val missing = missingFacts(facts, locationResolution)
            if (missing.isNotEmpty()) add("coverage_decision")
            if (!facts.safetyKnown || !facts.locationConfirmed || locationResolution?.dispatchable != true) {
                add("dispatch_simulation")
            }
        }
}
