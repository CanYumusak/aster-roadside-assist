package com.aster.roadside.service

import com.aster.roadside.data.FakeRoadsideData
import com.aster.roadside.domain.AssistanceAction
import com.aster.roadside.domain.ClaimStage
import com.aster.roadside.domain.ClaimSession
import com.aster.roadside.domain.ClaimWorkflow
import com.aster.roadside.domain.CoverageDecision
import com.aster.roadside.domain.IncidentType
import org.springframework.stereotype.Service
import java.time.Instant

@Service
class CoverageDecisionService(
    private val locationLookupService: LocationLookupService,
) {
    fun finalizeCoverage(claim: ClaimSession): ClaimSession {
        val facts = claim.intakeFacts

        if (facts.callerIsPolicyholder == false) {
            return routeToHumanCallback(claim, "Caller is not the policyholder.")
        }

        val incidentType =
            facts.issueType
                ?.let(IncidentType::fromWireValue)
                ?: return routeToHumanCallback(
                    claim,
                    "Incident type was not clear enough for automated coverage assessment.",
                )

        if (incidentType.requiresHumanCallback) {
            return routeToHumanCallback(claim, humanCallbackReason(incidentType))
        }

        val customer = claim.identity.customerId?.let(::findCustomer)
        val vehicle =
            customer
                ?.vehicles
                ?.firstOrNull { it.id == facts.selectedVehicleId }
                ?: customer?.vehicles?.firstOrNull()
        val policy =
            vehicle
                ?.policyId
                ?.let(::findPolicy)
                ?: return routeToHumanCallback(
                    claim,
                    "Policy data was unavailable for the selected vehicle.",
                )

        val covered = policy.coveredEvents.contains(incidentType.wireValue)
        if (!covered) {
            val decision =
                CoverageDecision(
                    covered = false,
                    confidence = 0.72,
                    rationale = "${policy.name} does not automatically cover ${incidentType.displayName} in the prototype policy data.",
                    escalationRequired = true,
                )
            return completeNotCovered(claim, decision)
        }

        val decision =
            CoverageDecision(
                covered = true,
                confidence = 0.91,
                rationale = "${policy.name} covers ${incidentType.displayName} and no prototype exclusion was triggered.",
                escalationRequired = false,
            )
        val providerMatch =
            locationLookupService.matchProvider(
                incidentType.dispatchAction,
                claim.artifacts.locationResolution,
            )
        val action =
            AssistanceAction(
                actionType = incidentType.dispatchAction,
                providerName = providerMatch.providerName,
                etaMinutes = providerMatch.etaMinutes,
                customerMessage = "Aster Roadside has assessed your case and arranged the next best assistance step.",
            )
        val now = Instant.now()

        return claim.copy(
            workflow =
                ClaimWorkflow.Completed(
                    stage = ClaimStage.SMS,
                    stateEvaluation = claim.workflow.stateEvaluation,
                ),
            artifacts =
                claim.artifacts.copy(
                    coverageDecision = decision,
                    providerMatch = providerMatch,
                    assistanceAction = action,
                    smsPreview = dispatchSms(claim.identity.id, action),
                ),
            updatedAt = now,
        ).withAuditEvents(
            listOf(
                AuditEventDraft(
                    type = "coverage.decided",
                    status = "ok",
                    label = decision.rationale,
                ),
                AuditEventDraft(
                    type = "sms.generated",
                    status = "ok",
                    label = "Customer SMS generated",
                ),
            ),
            now,
        )
    }

    fun routeToHumanCallback(
        claim: ClaimSession,
        reason: String,
    ): ClaimSession {
        val safetyCancellation = isSafetyCancellation(reason)
        val now = Instant.now()
        if (safetyCancellation) {
            return claim.copy(
                workflow =
                    ClaimWorkflow.Cancelled(
                        stage = ClaimStage.CLOSED,
                        stateEvaluation = claim.workflow.stateEvaluation,
                    ),
                artifacts =
                    claim.artifacts.copy(
                        coverageDecision =
                            CoverageDecision(
                                covered = false,
                                confidence = 0.0,
                                rationale = reason,
                                escalationRequired = false,
                            ),
                        assistanceAction = null,
                        smsPreview = null,
                    ),
                updatedAt = now,
            ).withAuditEvents(
                listOf(
                    AuditEventDraft(
                        type = "case.cancelled",
                        status = "blocked",
                        label = reason,
                    ),
                    AuditEventDraft(
                        type = "sms.skipped",
                        status = "skipped",
                        label = "SMS skipped for security exit",
                    ),
                ),
                now,
            )
        }

        return claim.copy(
            workflow =
                ClaimWorkflow.HumanCallback(
                    stage = ClaimStage.SMS,
                    missingFacts = claim.workflow.missingFacts,
                    blockedActions = claim.workflow.blockedActions,
                    stateEvaluation = claim.workflow.stateEvaluation,
                ),
            artifacts =
                claim.artifacts.copy(
                    coverageDecision =
                        CoverageDecision(
                            covered = false,
                            confidence = 0.0,
                            rationale = reason,
                            escalationRequired = true,
                        ),
                    assistanceAction = null,
                    smsPreview = callbackSms(claim.identity.id),
                ),
            updatedAt = now,
        ).withAuditEvents(
            listOf(
                AuditEventDraft(
                    type = "human.callback",
                    status = "warn",
                    label = reason,
                ),
                AuditEventDraft(
                    type = "sms.generated",
                    status = "ok",
                    label = "Customer SMS generated",
                ),
            ),
            now,
        )
    }

    private fun completeNotCovered(
        claim: ClaimSession,
        decision: CoverageDecision,
    ): ClaimSession {
        val now = Instant.now()
        return claim.copy(
            workflow =
                ClaimWorkflow.NotCovered(
                    stage = ClaimStage.SMS,
                    stateEvaluation = claim.workflow.stateEvaluation,
                ),
            artifacts =
                claim.artifacts.copy(
                    coverageDecision = decision,
                    assistanceAction = null,
                    smsPreview = notCoveredSms(claim.identity.id, decision),
                ),
            updatedAt = now,
        ).withAuditEvents(
            listOf(
                AuditEventDraft(
                    type = "coverage.decided",
                    status = "blocked",
                    label = decision.rationale,
                ),
                AuditEventDraft(
                    type = "sms.generated",
                    status = "ok",
                    label = "Customer SMS generated",
                ),
            ),
            now,
        )
    }

    private fun findCustomer(id: String) =
        FakeRoadsideData.customers.firstOrNull { it.id == id }

    private fun findPolicy(id: String) =
        FakeRoadsideData.policies.firstOrNull { it.id == id }

    private fun humanCallbackReason(incidentType: IncidentType) =
        when (incidentType) {
            IncidentType.EV_WARNING -> "The caller reported an EV warning light, which may involve high-voltage or battery safety risk, so the prototype routes this to a roadside specialist."
            IncidentType.ACCIDENT_WITH_INJURY -> "Security exit: caller may be injured or in immediate danger. Automated roadside intake cannot continue until everyone is safe."
            IncidentType.THIRD_PARTY_CALLER -> "The caller is not the policyholder, so the prototype routes this to a roadside specialist."
            else -> "The reported incident requires a roadside specialist review."
        }

    private fun dispatchSms(
        caseRef: String,
        action: AssistanceAction,
    ) = "Aster Roadside: ${action.providerName} is assigned for ${action.actionType.wireValue.replace('_', ' ')}. ETA ${action.etaMinutes} min. Case ref: $caseRef."

    private fun callbackSms(caseRef: String) =
        "Aster Roadside: Your case has been sent to a roadside specialist. They will call you back as soon as one is available. Case ref: $caseRef. If you are in immediate danger, call emergency services."

    private fun notCoveredSms(
        caseRef: String,
        decision: CoverageDecision,
    ): String {
        val customerReason =
            decision.rationale
                .replace(" in the prototype policy data", "")
                .replace("does not automatically cover", "does not cover")
                .trimEnd('.')
        return "Aster Roadside: We assessed your roadside request, but it is not covered by your policy. $customerReason. No truck has been dispatched. Case ref: $caseRef."
    }

    private fun isSafetyCancellation(reason: String) =
        reason.contains("safe place", ignoreCase = true) ||
            reason.contains("not safe", ignoreCase = true) ||
            reason.contains("move to safety", ignoreCase = true) ||
            reason.contains("away from traffic", ignoreCase = true) ||
            reason.contains("middle of the road", ignoreCase = true) ||
            reason.contains("in traffic", ignoreCase = true) ||
            reason.contains("security exit", ignoreCase = true) ||
            reason.contains("immediate safety", ignoreCase = true) ||
            reason.contains("immediate danger", ignoreCase = true) ||
            reason.contains("injury", ignoreCase = true) ||
            reason.contains("injured", ignoreCase = true) ||
            reason.contains("emergency services", ignoreCase = true)

}
