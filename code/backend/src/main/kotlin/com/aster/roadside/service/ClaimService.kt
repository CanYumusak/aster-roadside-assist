package com.aster.roadside.service

import com.aster.roadside.data.FakeRoadsideData
import com.aster.roadside.domain.AuthMode
import com.aster.roadside.domain.AuthRisk
import com.aster.roadside.domain.AuthVerificationResponse
import com.aster.roadside.domain.AppendToolCallTraceRequest
import com.aster.roadside.domain.BlockedAction
import com.aster.roadside.domain.ClaimArtifacts
import com.aster.roadside.domain.ClaimAuthentication
import com.aster.roadside.domain.ClaimIdentity
import com.aster.roadside.domain.ClaimSession
import com.aster.roadside.domain.ClaimStatus
import com.aster.roadside.domain.ClaimWorkflow
import com.aster.roadside.domain.ClaimStage
import com.aster.roadside.domain.CoverageDecision
import com.aster.roadside.domain.CreateClaimRequest
import com.aster.roadside.domain.Customer
import com.aster.roadside.domain.IntakeFacts
import com.aster.roadside.domain.LocationResolution
import com.aster.roadside.domain.NextStepResponse
import com.aster.roadside.domain.TranscriptTurn
import com.aster.roadside.domain.ToolCallTrace
import com.aster.roadside.domain.UpdateFactsRequest
import com.aster.roadside.domain.VerifyKnownPinRequest
import com.aster.roadside.domain.VerifyUnknownIdentityRequest
import com.aster.roadside.domain.VerifiedCustomerDetails
import com.aster.roadside.domain.VerifiedVehicleDetails
import com.aster.roadside.domain.WorkflowAction
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

@Service
class ClaimService(
    private val stateMachine: RoadsideStateMachine,
    private val locationLookupService: LocationLookupService,
    private val incidentClassifier: IncidentClassifier,
    private val coverageDecisionService: CoverageDecisionService,
) {
    private val claims = ConcurrentHashMap<String, ClaimSession>()

    fun createClaim(request: CreateClaimRequest): ClaimSession {
        val now = Instant.now()
        val customer = findCustomerByPhone(request.callerPhoneNumber)
        val selectedVehicle =
            request.selectedVehicleId ?: customer?.vehicles?.firstOrNull()?.id
        val callerIsPolicyholder = request.callerIsPolicyholder
        val pinChallengePositions = pinChallengePositionsFor(customer).ifEmpty { UNKNOWN_PIN_CHALLENGE_POSITIONS }

        val facts =
            IntakeFacts(
                identityConfirmed = false,
                vehicleConfirmed = false,
                selectedVehicleId = selectedVehicle,
                callerIsPolicyholder = callerIsPolicyholder,
            )
        val locationResolution = locationLookupService.resolve(facts.location)
        val evaluation = stateMachine.evaluate(facts, locationResolution)

        val session =
            ClaimSession(
                identity =
                    ClaimIdentity(
                        id = newCaseRef(),
                        callerPhoneNumber = request.callerPhoneNumber,
                        customerId = customer?.id,
                        scenarioId = request.scenarioId,
                    ),
                authentication =
                    ClaimAuthentication(
                        authMode = if (customer == null) AuthMode.FALLBACK_SIMULATED else AuthMode.KNOWN_NUMBER_SIMULATED,
                        authRisk = if (customer == null || callerIsPolicyholder == false) AuthRisk.ELEVATED else AuthRisk.STANDARD,
                        pinChallengePositions = pinChallengePositions,
                        pinVerificationAttempts = 0,
                    ),
                intakeFacts = facts,
                workflow =
                    ClaimWorkflow.Intake(
                        status = ClaimStatus.CREATED,
                        stage = evaluation.stage,
                        missingFacts = evaluation.missingFacts,
                        blockedActions = evaluation.blockedActions,
                        stateEvaluation = evaluation,
                    ),
                artifacts =
                    ClaimArtifacts(
                        locationResolution = locationResolution,
                        providerMatch = null,
                        coverageDecision = null,
                        assistanceAction = null,
                        smsPreview = null,
                    ),
                createdAt = now,
                updatedAt = now,
                auditEvents = listOf(caseCreatedEvent(now)),
            )

        claims[session.identity.id] = session
        return session
    }

    fun getClaim(id: String): ClaimSession =
        claims[id] ?: throw NoSuchElementException("Claim not found: $id")

    fun listClaims(): List<ClaimSession> =
        claims.values.sortedByDescending { it.updatedAt }

    fun appendTranscript(
        id: String,
        speaker: String,
        text: String,
    ): ClaimSession {
        val existing = getClaim(id)
        val normalizedSpeaker =
            when (speaker.trim().lowercase()) {
                "caller", "user", "customer" -> "caller"
                else -> "agent"
            }
        val trimmedText = text.trim()
        if (trimmedText.isBlank()) return existing

        val lastTurn = existing.transcript.lastOrNull()
        if (lastTurn?.speaker == normalizedSpeaker && lastTurn.text == trimmedText) {
            return existing
        }

        val updated =
            existing.copy(
                transcript =
                    existing.transcript +
                        TranscriptTurn(
                            speaker = normalizedSpeaker,
                            text = trimmedText,
                            createdAt = Instant.now(),
                        ),
                updatedAt = Instant.now(),
            )
        claims[id] = updated
        return updated
    }

    fun appendToolCallTrace(
        id: String,
        request: AppendToolCallTraceRequest,
    ): ClaimSession {
        val existing = getClaim(id)
        val toolName = request.toolName.trim()
        val callId = request.callId.trim()
        if (toolName.isBlank() || callId.isBlank()) return existing
        if (existing.toolCalls.any { it.toolName == toolName && it.callId == callId }) return existing

        val now = Instant.now()
        val updated =
            existing.copy(
                toolCalls =
                    existing.toolCalls +
                        ToolCallTrace(
                            toolName = toolName,
                            callId = callId,
                            status = request.status.ifBlank { "ok" },
                            argumentsSummary = request.argumentsSummary,
                            resultSummary = request.resultSummary,
                            createdAt = now,
                        ),
                updatedAt = now,
            )
        claims[id] = updated
        return updated
    }

    fun updateFacts(
        id: String,
        request: UpdateFactsRequest,
    ): ClaimSession {
        val existing = getClaim(id)
        val current = existing.intakeFacts
        val existingLocation = existing.artifacts.locationResolution
        val requestedLocation = request.location?.trim()?.takeIf { it.isNotBlank() }
        val locationCandidate = requestedLocation ?: current.location
        val locationEvidence =
            LocationEvidence(
                previousLocationText = current.location,
                spokenLocation = locationCandidate,
                callerConfirmedCandidate = request.locationVerifiedByCaller == true,
                previousResolution = existingLocation,
            )
        val locationResolution =
            if (requestedLocation == null && current.locationConfirmed && existingLocation?.dispatchable == true) {
                existingLocation
            } else {
                locationLookupService.resolve(locationEvidence)
            }
        val requestedIncident =
            request.incidentSummary?.trim()?.takeIf { it.isNotBlank() }
                ?: request.issueType?.trim()?.takeIf { it.isNotBlank() }
        val incidentClassification = requestedIncident?.let(::classifyIncident)
        val locationChanged = requestedLocation != null && requestedLocation != current.location
        val dispatchableLocation = locationResolution?.dispatchable == true
        val locationRequiresConfirmation = locationResolution?.requiresCallerConfirmation == true
        val preservedConfirmedLocation = current.locationConfirmed && !locationChanged && dispatchableLocation
        val locationConfirmed =
            when {
                request.locationConfirmed == false -> false
                !dispatchableLocation -> false
                locationEvidence.callerConfirmedCandidate -> true
                locationEvidence.callerClarifiedAmbiguousLocation && !locationRequiresConfirmation -> true
                locationRequiresConfirmation -> preservedConfirmedLocation
                request.locationConfirmed == true || requestedLocation != null -> true
                else -> preservedConfirmedLocation
            }
        val incidentKnown =
            when {
                request.incidentKnown == false -> false
                request.incidentKnown == true || requestedIncident != null -> incidentClassification?.canonicalType != null
                else -> current.incidentKnown
            }
        val updatedFacts =
            current.copy(
                identityConfirmed = request.identityConfirmed ?: current.identityConfirmed,
                vehicleConfirmed = request.vehicleConfirmed ?: current.vehicleConfirmed,
                locationConfirmed = locationConfirmed,
                safetyKnown = request.safetyKnown ?: current.safetyKnown,
                incidentKnown = incidentKnown,
                callerIsPolicyholder = request.callerIsPolicyholder ?: current.callerIsPolicyholder,
                selectedVehicleId = request.selectedVehicleId ?: current.selectedVehicleId,
                location = locationCandidate,
                issueType = incidentClassification?.canonicalType ?: if (requestedIncident == null) current.issueType else requestedIncident,
                incidentSummary = requestedIncident ?: current.incidentSummary,
                safetySummary = request.safetySummary ?: current.safetySummary,
            )
        val evaluation = stateMachine.evaluate(updatedFacts, locationResolution)

        val now = Instant.now()
        val cancelled = evaluation.allowedAction == WorkflowAction.CANCELLED
        val updated =
            existing.copy(
                intakeFacts = updatedFacts,
                workflow =
                    if (cancelled) {
                        ClaimWorkflow.Cancelled(
                            stage = ClaimStage.CLOSED,
                            stateEvaluation = evaluation,
                        )
                    } else {
                        ClaimWorkflow.Intake(
                            status = ClaimStatus.IN_PROGRESS,
                            stage = evaluation.stage,
                            missingFacts = evaluation.missingFacts,
                            blockedActions = evaluation.blockedActions,
                            stateEvaluation = evaluation,
                        )
                    },
                artifacts =
                    existing.artifacts.copy(
                        locationResolution = locationResolution,
                        coverageDecision =
                            if (cancelled) {
                                CoverageDecision(
                                    covered = false,
                                    confidence = 0.0,
                                    rationale = evaluation.reason,
                                    escalationRequired = false,
                                )
                            } else {
                                existing.artifacts.coverageDecision
                            },
                        assistanceAction = if (cancelled) null else existing.artifacts.assistanceAction,
                        smsPreview = if (cancelled) null else existing.artifacts.smsPreview,
                    ),
                updatedAt = now,
            ).withAuditEvents(
                factAuditEvents(existing, updatedFacts, locationResolution) +
                    if (cancelled) {
                        listOf(
                            AuditEventDraft("case.cancelled", "blocked", evaluation.reason),
                            AuditEventDraft("sms.skipped", "skipped", "SMS skipped for security exit"),
                        )
                    } else {
                        emptyList()
                    },
                now,
            )

        claims[id] = updated
        return updated
    }

    fun nextStep(id: String): NextStepResponse {
        val claim = getClaim(id)
        if (claim.workflow.status == ClaimStatus.NEEDS_HUMAN_CALLBACK) {
            return NextStepResponse(
                allowedAction = WorkflowAction.HUMAN_CALLBACK,
                question = null,
                reason = claim.artifacts.coverageDecision?.rationale ?: "Claim requires human callback.",
                blockedActions =
                    listOf(
                        BlockedAction.COVERAGE_DECISION,
                        BlockedAction.DISPATCH_SIMULATION,
                    ),
            )
        }
        if (claim.workflow.status == ClaimStatus.CANCELLED) {
            return NextStepResponse(
                allowedAction = WorkflowAction.CANCELLED,
                question = null,
                reason = claim.artifacts.coverageDecision?.rationale ?: "Claim was cancelled.",
                blockedActions =
                    listOf(
                        BlockedAction.COVERAGE_DECISION,
                        BlockedAction.DISPATCH_SIMULATION,
                    ),
            )
        }
        val evaluation = claim.workflow.stateEvaluation ?: stateMachine.evaluate(claim.intakeFacts, claim.artifacts.locationResolution)
        return NextStepResponse(
            allowedAction = evaluation.allowedAction,
            question = evaluation.question,
            reason = evaluation.reason,
            blockedActions = evaluation.blockedActions,
        )
    }

    fun verifyKnownPin(
        id: String,
        request: VerifyKnownPinRequest,
    ): AuthVerificationResponse {
        val existing = getClaim(id)
        val customer = existing.identity.customerId?.let(::findCustomerById)
            ?: return verificationResponse(
                claim =
                    routeToHumanCallback(
                        existing,
                        "Known-number PIN verification was requested, but no customer was matched.",
                    ),
                verified = false,
                reason = "No customer matched this call.",
                customer = null,
                positions = emptyList(),
            )

        val positions =
            existing.authentication.pinChallengePositions.ifEmpty {
                pinChallengePositionsFor(customer)
            }
        val expectedDigits =
            positions
                .mapNotNull { position -> customer.roadsidePin.getOrNull(position - 1) }
                .joinToString("")
        val providedDigits = "${request.firstDigit}${request.secondDigit}"

        val pinMatched = expectedDigits == providedDigits
        log.info(
            "pin_verification claim={} customer={} positions={} matched={} attempt={}",
            id,
            customer.id,
            positions,
            pinMatched,
            existing.authentication.pinVerificationAttempts + if (pinMatched) 0 else 1,
        )

        if (!pinMatched) {
            val failedAttempts = existing.authentication.pinVerificationAttempts + 1
            if (failedAttempts >= MAX_PIN_ATTEMPTS) {
                val completed =
                    cancelForFailedVerification(
                        existing.withPinAttempts(failedAttempts),
                        "PIN challenge failed after $MAX_PIN_ATTEMPTS attempts.",
                    )
                return verificationResponse(
                    claim = completed,
                    verified = false,
                    reason = "PIN challenge did not match after $MAX_PIN_ATTEMPTS attempts. Intake cancelled because the caller could not be identified.",
                    customer = customer,
                    positions = positions,
                    attemptsRemaining = 0,
                )
            }

            val now = Instant.now()
            val updated =
                existing.copy(
                    authentication = existing.authentication.copy(pinVerificationAttempts = failedAttempts),
                    updatedAt = now,
                ).withAuditEvent(
                    type = "auth.retry",
                    status = "warn",
                    label = "$failedAttempts PIN attempt(s)",
                    timestamp = now,
                )
            claims[id] = updated
            return verificationResponse(
                claim = updated,
                verified = false,
                reason = "PIN challenge did not match. Tell the caller it did not work and ask them to try again.",
                customer = customer,
                positions = positions,
                attemptsRemaining = MAX_PIN_ATTEMPTS - failedAttempts,
            )
        }

        val facts =
            existing.intakeFacts.copy(
                identityConfirmed = true,
                safetyKnown = true,
                safetySummary = existing.intakeFacts.safetySummary ?: "Safety verbally checked before authentication.",
            )
        val evaluation = stateMachine.evaluate(facts, existing.artifacts.locationResolution)
        val now = Instant.now()
        val updated =
            existing.copy(
                intakeFacts = facts,
                authentication = existing.authentication.copy(pinVerificationAttempts = 0),
                workflow =
                    ClaimWorkflow.Intake(
                        status = ClaimStatus.IN_PROGRESS,
                        stage = evaluation.stage,
                        missingFacts = evaluation.missingFacts,
                        blockedActions = evaluation.blockedActions,
                        stateEvaluation = evaluation,
                    ),
                updatedAt = now,
            ).withAuditEvent(
                type = "auth.updated",
                status = "ok",
                label = "Identity verified",
                timestamp = now,
            )
        claims[id] = updated

        return verificationResponse(
            claim = updated,
            verified = true,
            reason = "PIN challenge verified by backend.",
            customer = customer,
            positions = positions,
        )
    }

    fun verifyUnknownIdentity(
        id: String,
        request: VerifyUnknownIdentityRequest,
    ): AuthVerificationResponse {
        val existing = getClaim(id)
        val normalizedName = normalizeName(request.name)
        val positions = existing.authentication.pinChallengePositions.ifEmpty { UNKNOWN_PIN_CHALLENGE_POSITIONS }
        val identityMatchedCustomer =
            unknownNumberVerificationCustomers().firstOrNull {
                normalizeName(it.name) == normalizedName &&
                    it.birthDate == request.birthDate.trim()
            }
        val expectedDigits = identityMatchedCustomer?.let { pinDigitsForPositions(it.roadsidePin, positions) }
        val providedDigits = "${request.firstDigit}${request.secondDigit}"
        val pinMatched = expectedDigits == providedDigits
        val matchedCustomer = identityMatchedCustomer?.takeIf { pinMatched }

        log.info(
            "unknown_identity_verification claim={} candidateCustomer={} positions={} identityMatched={} pinMatched={} attempt={}",
            id,
            identityMatchedCustomer?.id,
            positions,
            identityMatchedCustomer != null,
            pinMatched,
            existing.authentication.pinVerificationAttempts + if (matchedCustomer == null) 1 else 0,
        )

        if (matchedCustomer == null) {
            val failedAttempts = existing.authentication.pinVerificationAttempts + 1
            val failureReason =
                if (identityMatchedCustomer == null) {
                    "Customer record was not found for that name and birthdate."
                } else {
                    "PIN challenge did not match."
                }
            if (failedAttempts >= MAX_PIN_ATTEMPTS) {
                val completed =
                    cancelForFailedVerification(
                        existing.withPinAttempts(failedAttempts),
                        "$failureReason Unknown-number verification failed after $MAX_PIN_ATTEMPTS attempts.",
                    )
                return verificationResponse(
                    claim = completed,
                    verified = false,
                    reason = "$failureReason Intake cancelled after $MAX_PIN_ATTEMPTS attempts because the caller could not be identified.",
                    customer = null,
                    positions = positions,
                    attemptsRemaining = 0,
                )
            }

            val now = Instant.now()
            val updated =
                existing.copy(
                    authentication = existing.authentication.copy(pinVerificationAttempts = failedAttempts),
                    updatedAt = now,
                ).withAuditEvent(
                    type = "auth.retry",
                    status = "warn",
                    label = "$failedAttempts verification attempt(s)",
                    timestamp = now,
                )
            claims[id] = updated
            return verificationResponse(
                claim = updated,
                verified = false,
                reason =
                    if (identityMatchedCustomer == null) {
                        "Customer record was not found. Tell the caller you could not find those customer details and ask them to repeat their full name, birthdate, and requested PIN digits."
                    } else {
                        "PIN challenge did not match. Tell the caller the PIN digits did not work and ask them to try again."
                    },
                customer = null,
                positions = positions,
                attemptsRemaining = MAX_PIN_ATTEMPTS - failedAttempts,
            )
        }

        val facts =
            existing.intakeFacts.copy(
                identityConfirmed = true,
                safetyKnown = true,
                safetySummary = existing.intakeFacts.safetySummary ?: "Safety verbally checked before authentication.",
                selectedVehicleId = existing.intakeFacts.selectedVehicleId ?: matchedCustomer.vehicles.firstOrNull()?.id,
            )
        val locationResolution = locationLookupService.resolve(facts.location)
        val evaluation = stateMachine.evaluate(facts, locationResolution)
        val now = Instant.now()
        val updated =
            existing.copy(
                identity = existing.identity.copy(customerId = matchedCustomer.id),
                authentication =
                    existing.authentication.copy(
                        authRisk = AuthRisk.ELEVATED,
                        pinChallengePositions = positions,
                        pinVerificationAttempts = 0,
                    ),
                intakeFacts = facts,
                workflow =
                    ClaimWorkflow.Intake(
                        status = ClaimStatus.IN_PROGRESS,
                        stage = evaluation.stage,
                        missingFacts = evaluation.missingFacts,
                        blockedActions = evaluation.blockedActions,
                        stateEvaluation = evaluation,
                    ),
                artifacts = existing.artifacts.copy(locationResolution = locationResolution),
                updatedAt = now,
            ).withAuditEvent(
                type = "auth.updated",
                status = "ok",
                label = "Identity verified",
                timestamp = now,
            )
        claims[id] = updated

        return verificationResponse(
            claim = updated,
            verified = true,
            reason = "Unknown-number caller verified by name, birthdate, and requested PIN digits.",
            customer = matchedCustomer,
            positions = positions,
        )
    }

    fun finalizeClaim(id: String): ClaimSession {
        val existing = getClaim(id)
        val facts = existing.intakeFacts
        val evaluation = stateMachine.evaluate(facts, existing.artifacts.locationResolution)

        if (facts.callerIsPolicyholder == false) {
            return routeToHumanCallback(existing, "Caller is not the policyholder.")
        }

        if (evaluation.allowedAction != WorkflowAction.COVERAGE_DECISION) {
            val updated =
                existing.copy(
                    workflow =
                        ClaimWorkflow.Intake(
                            status = ClaimStatus.IN_PROGRESS,
                            stage = evaluation.stage,
                            missingFacts = evaluation.missingFacts,
                            blockedActions = evaluation.blockedActions,
                            stateEvaluation = evaluation,
                        ),
                    updatedAt = Instant.now(),
                )
            claims[id] = updated
            return updated
        }

        val completed = coverageDecisionService.finalizeCoverage(existing)
        claims[id] = completed
        return completed
    }

    fun finalizeHumanCallback(
        id: String,
        reason: String = "Caller was routed to human callback.",
    ): ClaimSession = routeToHumanCallback(getClaim(id), reason)

    fun finalizeCancellation(
        id: String,
        reason: String = "Call cancelled.",
    ): ClaimSession =
        cancelClaim(
            claim = getClaim(id),
            reason = reason,
            auditType = "case.cancelled",
            smsSkippedLabel = "SMS skipped for cancelled call.",
        )

    private fun cancelForFailedVerification(
        claim: ClaimSession,
        reason: String,
    ): ClaimSession =
        cancelClaim(
            claim = claim,
            reason = reason,
            auditType = "auth.cancelled",
            smsSkippedLabel = "SMS skipped because identity verification failed.",
        )

    private fun cancelClaim(
        claim: ClaimSession,
        reason: String,
        auditType: String,
        smsSkippedLabel: String,
    ): ClaimSession {
        val now = Instant.now()
        val completed =
            claim.copy(
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
                    AuditEventDraft(auditType, "blocked", reason),
                    AuditEventDraft("sms.skipped", "skipped", smsSkippedLabel),
                ),
                now,
            )
        claims[claim.identity.id] = completed
        return completed
    }

    private fun routeToHumanCallback(
        claim: ClaimSession,
        reason: String,
    ): ClaimSession {
        val completed = coverageDecisionService.routeToHumanCallback(claim, reason)
        claims[claim.identity.id] = completed
        return completed
    }

    private fun ClaimSession.withPinAttempts(attempts: Int) =
        copy(authentication = authentication.copy(pinVerificationAttempts = attempts))

    private fun factAuditEvents(
        existing: ClaimSession,
        updatedFacts: IntakeFacts,
        locationResolution: LocationResolution?,
    ): List<AuditEventDraft> {
        val current = existing.intakeFacts
        val events = mutableListOf<AuditEventDraft>()
        if (updatedFacts.safetyKnown && !current.safetyKnown) {
            events += AuditEventDraft("safety.checked", "ok", "Safety checked")
        }
        if (updatedFacts.vehicleConfirmed && !current.vehicleConfirmed) {
            events += AuditEventDraft("fact.vehicle", "ok", "Vehicle confirmed")
        }
        if (
            locationResolution != null &&
            (updatedFacts.location != current.location ||
                updatedFacts.locationConfirmed != current.locationConfirmed ||
                locationResolution.formattedAddress != existing.artifacts.locationResolution?.formattedAddress ||
                locationResolution.rationale != existing.artifacts.locationResolution?.rationale)
        ) {
            events +=
                AuditEventDraft(
                    type = "location.resolved",
                    status = if (locationResolution.dispatchable) "ok" else "blocked",
                    label = locationResolution.rationale,
                )
        }
        if (updatedFacts.incidentKnown && !current.incidentKnown) {
            events += AuditEventDraft("incident.classified", "ok", "Incident classified")
        }
        return events
    }

    private fun findCustomerByPhone(phone: String) =
        FakeRoadsideData.customers.firstOrNull {
            normalizePhone(it.phoneNumber) == normalizePhone(phone)
        }

    private fun findCustomerById(id: String) =
        FakeRoadsideData.customers.firstOrNull { it.id == id }

    private fun unknownNumberVerificationCustomers() =
        FakeRoadsideData.customers.filter {
            it.demoLabel.equals("Unknown-number verification demo", ignoreCase = true)
        }

    private fun classifyIncident(summary: String): IncidentClassification {
        val canonical = incidentClassifier.classify(summary)
        return IncidentClassification(canonicalType = canonical)
    }

    private fun normalizePhone(phone: String) = phone.filter { it.isDigit() || it == '+' }

    private fun normalizeName(name: String) = name.trim().lowercase().replace(Regex("\\s+"), " ")

    private fun pinDigitsForPositions(
        pin: String,
        positions: List<Int>,
    ) = positions
        .mapNotNull { position -> pin.getOrNull(position - 1) }
        .joinToString("")

    private fun pinChallengePositionsFor(customer: Customer?): List<Int> {
        if (customer == null) return emptyList()
        val pairs =
            listOf(
                listOf(1, 3),
                listOf(2, 4),
                listOf(1, 4),
                listOf(2, 5),
                listOf(3, 6),
            )
        val index = FakeRoadsideData.customers.indexOfFirst { it.id == customer.id }.takeIf { it >= 0 } ?: 0
        return pairs[index % pairs.size].filter { it <= customer.roadsidePin.length }
    }

    private fun verificationResponse(
        claim: ClaimSession,
        verified: Boolean,
        reason: String,
        customer: Customer?,
        positions: List<Int>,
        attemptsRemaining: Int = MAX_PIN_ATTEMPTS - claim.authentication.pinVerificationAttempts,
    ) = AuthVerificationResponse(
        verified = verified,
        reason = reason,
        authRisk = claim.authentication.authRisk,
        policyholderName = customer?.name.takeIf { verified },
        customerDetails = customer?.takeIf { verified }?.toVerifiedDetails(),
        pinChallengePositions = positions,
        attemptsRemaining = attemptsRemaining.coerceAtLeast(0),
        humanCallbackRequired = claim.workflow.status == ClaimStatus.NEEDS_HUMAN_CALLBACK,
        cancellationRequired = claim.workflow.status == ClaimStatus.CANCELLED,
        vehicleOptions =
            customer?.vehicles?.takeIf { verified }?.map {
                "${it.year} ${it.make} ${it.model}, registration ${it.registration}"
            } ?: emptyList(),
        nextStep =
            if (!verified && claim.workflow.status != ClaimStatus.NEEDS_HUMAN_CALLBACK && claim.workflow.status != ClaimStatus.CANCELLED) {
                NextStepResponse(
                    allowedAction = WorkflowAction.RETRY_PIN,
                    question = "Please provide the requested PIN digits again.",
                    reason = reason,
                    blockedActions =
                        listOf(
                            BlockedAction.COVERAGE_DECISION,
                            BlockedAction.DISPATCH_SIMULATION,
                        ),
                )
            } else {
                nextStep(claim.identity.id)
            },
    )

    private fun Customer.toVerifiedDetails() =
        VerifiedCustomerDetails(
            id = id,
            name = name,
            birthDate = birthDate,
            phoneNumber = phoneNumber,
            homePostcode = homePostcode,
            preferredContact = preferredContact,
            vehicles =
                vehicles.map {
                    VerifiedVehicleDetails(
                        id = it.id,
                        registration = it.registration,
                        make = it.make,
                        model = it.model,
                        year = it.year,
                        colour = it.colour,
                        fuelType = it.fuelType,
                        policyId = it.policyId,
                    )
                },
        )

    private companion object {
        const val MAX_PIN_ATTEMPTS = 3
        val UNKNOWN_PIN_CHALLENGE_POSITIONS = listOf(1, 4)
        val log = LoggerFactory.getLogger(ClaimService::class.java)
    }

    private fun newCaseRef() = "AST-${UUID.randomUUID().toString().take(8).uppercase()}"

    private data class IncidentClassification(
        val canonicalType: String?,
    )
}
