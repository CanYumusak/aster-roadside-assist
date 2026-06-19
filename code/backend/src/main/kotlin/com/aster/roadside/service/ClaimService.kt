package com.aster.roadside.service

import com.aster.roadside.data.FakeRoadsideData
import com.aster.roadside.domain.AssistanceAction
import com.aster.roadside.domain.AuthMode
import com.aster.roadside.domain.AuthRisk
import com.aster.roadside.domain.AuthVerificationResponse
import com.aster.roadside.domain.ClaimSession
import com.aster.roadside.domain.ClaimStatus
import com.aster.roadside.domain.CoverageDecision
import com.aster.roadside.domain.CreateClaimRequest
import com.aster.roadside.domain.Customer
import com.aster.roadside.domain.IntakeFacts
import com.aster.roadside.domain.NextStepResponse
import com.aster.roadside.domain.UpdateFactsRequest
import com.aster.roadside.domain.VerifyKnownPinRequest
import com.aster.roadside.domain.VerifyUnknownIdentityRequest
import com.aster.roadside.domain.VerifiedCustomerDetails
import com.aster.roadside.domain.VerifiedVehicleDetails
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
                id = newCaseRef(),
                callerPhoneNumber = request.callerPhoneNumber,
                customerId = customer?.id,
                scenarioId = request.scenarioId,
                authMode = if (customer == null) AuthMode.FALLBACK_SIMULATED else AuthMode.KNOWN_NUMBER_SIMULATED,
                authRisk = if (customer == null || callerIsPolicyholder == false) AuthRisk.ELEVATED else AuthRisk.STANDARD,
                status = ClaimStatus.CREATED,
                stage = evaluation.stage.label,
                intakeFacts = facts,
                missingFacts = evaluation.missingFacts,
                blockedActions = evaluation.blockedActions,
                pinChallengePositions = pinChallengePositions,
                pinVerificationAttempts = 0,
                locationResolution = locationResolution,
                providerMatch = null,
                stateEvaluation = evaluation,
                coverageDecision = null,
                assistanceAction = null,
                smsPreview = null,
                createdAt = now,
                updatedAt = now,
            )

        claims[session.id] = session
        return session
    }

    fun getClaim(id: String): ClaimSession =
        claims[id] ?: throw NoSuchElementException("Claim not found: $id")

    fun updateFacts(
        id: String,
        request: UpdateFactsRequest,
    ): ClaimSession {
        val existing = getClaim(id)
        val current = existing.intakeFacts
        val requestedLocation = request.location?.trim()?.takeIf { it.isNotBlank() }
        val locationCandidate = requestedLocation ?: current.location
        val locationResolution = locationLookupService.resolve(locationCandidate)
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
                request.locationVerifiedByCaller == true -> true
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

        val updated =
            existing.copy(
                status = ClaimStatus.IN_PROGRESS,
                stage = evaluation.stage.label,
                intakeFacts = updatedFacts,
                missingFacts = evaluation.missingFacts,
                blockedActions = evaluation.blockedActions,
                locationResolution = locationResolution,
                stateEvaluation = evaluation,
                updatedAt = Instant.now(),
            )

        claims[id] = updated
        return updated
    }

    fun nextStep(id: String): NextStepResponse {
        val claim = getClaim(id)
        if (claim.status == ClaimStatus.NEEDS_HUMAN_CALLBACK) {
            return NextStepResponse(
                allowedAction = "human_callback",
                question = null,
                reason = claim.coverageDecision?.rationale ?: "Claim requires human callback.",
                blockedActions = listOf("coverage_decision", "dispatch_simulation"),
            )
        }
        val evaluation = claim.stateEvaluation ?: stateMachine.evaluate(claim.intakeFacts, claim.locationResolution)
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
        val customer = existing.customerId?.let(::findCustomerById)
            ?: return verificationResponse(
                claim = completeHumanCallback(existing, "Known-number PIN verification was requested, but no customer was matched."),
                verified = false,
                reason = "No customer matched this call.",
                customer = null,
                positions = emptyList(),
            )

        val positions =
            existing.pinChallengePositions.ifEmpty {
                pinChallengePositionsFor(customer)
            }
        val expectedDigits =
            positions
                .mapNotNull { position -> customer.roadsidePin.getOrNull(position - 1) }
                .joinToString("")
        val providedDigits = "${request.firstDigit}${request.secondDigit}"

        val pinMatched = expectedDigits == providedDigits
        log.info(
            "pin_verification claim={} customer={} positions={} expected='{}' firstDigit={} secondDigit={} provided='{}' matched={} attempt={}",
            id,
            customer.id,
            positions,
            expectedDigits,
            request.firstDigit,
            request.secondDigit,
            providedDigits,
            pinMatched,
            existing.pinVerificationAttempts + if (pinMatched) 0 else 1,
        )

        if (!pinMatched) {
            val failedAttempts = existing.pinVerificationAttempts + 1
            if (failedAttempts >= MAX_PIN_ATTEMPTS) {
                val completed =
                    completeHumanCallback(
                        existing.copy(pinVerificationAttempts = failedAttempts),
                        "PIN challenge failed after $MAX_PIN_ATTEMPTS attempts.",
                    )
                return verificationResponse(
                    claim = completed,
                    verified = false,
                    reason = "PIN challenge did not match after $MAX_PIN_ATTEMPTS attempts. Intake routed to human callback.",
                    customer = customer,
                    positions = positions,
                    attemptsRemaining = 0,
                )
            }

            val updated =
                existing.copy(
                    pinVerificationAttempts = failedAttempts,
                    updatedAt = Instant.now(),
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
        val evaluation = stateMachine.evaluate(facts, existing.locationResolution)
        val updated =
            existing.copy(
                status = ClaimStatus.IN_PROGRESS,
                stage = evaluation.stage.label,
                intakeFacts = facts,
                missingFacts = evaluation.missingFacts,
                blockedActions = evaluation.blockedActions,
                pinVerificationAttempts = 0,
                stateEvaluation = evaluation,
                updatedAt = Instant.now(),
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
        val positions = existing.pinChallengePositions.ifEmpty { UNKNOWN_PIN_CHALLENGE_POSITIONS }
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
            "unknown_identity_verification claim={} candidateCustomer={} positions={} expected='{}' firstDigit={} secondDigit={} provided='{}' identityMatched={} pinMatched={} attempt={}",
            id,
            identityMatchedCustomer?.id,
            positions,
            expectedDigits,
            request.firstDigit,
            request.secondDigit,
            providedDigits,
            identityMatchedCustomer != null,
            pinMatched,
            existing.pinVerificationAttempts + if (matchedCustomer == null) 1 else 0,
        )

        if (matchedCustomer == null) {
            val failedAttempts = existing.pinVerificationAttempts + 1
            val failureReason =
                if (identityMatchedCustomer == null) {
                    "Customer record was not found for that name and birthdate."
                } else {
                    "PIN challenge did not match."
                }
            if (failedAttempts >= MAX_PIN_ATTEMPTS) {
                val completed =
                    completeHumanCallback(
                        existing.copy(pinVerificationAttempts = failedAttempts),
                        "$failureReason Unknown-number verification failed after $MAX_PIN_ATTEMPTS attempts.",
                    )
                return verificationResponse(
                    claim = completed,
                    verified = false,
                    reason = "$failureReason Intake routed to human callback after $MAX_PIN_ATTEMPTS attempts.",
                    customer = null,
                    positions = positions,
                    attemptsRemaining = 0,
                )
            }

            val updated =
                existing.copy(
                    pinVerificationAttempts = failedAttempts,
                    updatedAt = Instant.now(),
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
        val updated =
            existing.copy(
                customerId = matchedCustomer.id,
                authRisk = AuthRisk.ELEVATED,
                status = ClaimStatus.IN_PROGRESS,
                stage = evaluation.stage.label,
                intakeFacts = facts,
                missingFacts = evaluation.missingFacts,
                blockedActions = evaluation.blockedActions,
                pinChallengePositions = positions,
                pinVerificationAttempts = 0,
                locationResolution = locationResolution,
                stateEvaluation = evaluation,
                updatedAt = Instant.now(),
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
        val evaluation = stateMachine.evaluate(facts, existing.locationResolution)

        if (facts.callerIsPolicyholder == false) {
            return completeHumanCallback(existing, "Caller is not the policyholder.")
        }

        if (evaluation.allowedAction != "coverage_decision") {
            val updated =
                existing.copy(
                    stage = evaluation.stage.label,
                    missingFacts = evaluation.missingFacts,
                    blockedActions = evaluation.blockedActions,
                    stateEvaluation = evaluation,
                    updatedAt = Instant.now(),
                )
            claims[id] = updated
            return updated
        }

        val issueType = facts.issueType
            ?: return completeHumanCallback(existing, "Incident type was not clear enough for automated coverage assessment.")
        if (issueRequiresHumanCallback(issueType)) {
            return completeHumanCallback(existing, humanCallbackReasonForIssue(issueType))
        }

        val customer = existing.customerId?.let(::findCustomerById)
        val vehicle =
            customer
                ?.vehicles
                ?.firstOrNull { it.id == facts.selectedVehicleId }
                ?: customer?.vehicles?.firstOrNull()
        val policy = vehicle?.policyId?.let(::findPolicyById)
            ?: return completeHumanCallback(existing, "Policy data was unavailable for the selected vehicle.")
        val covered = policy.coveredEvents.contains(issueType)
        val actionType = actionTypeForIssue(issueType)

        if (!covered) {
            val decision =
                CoverageDecision(
                    covered = false,
                    confidence = 0.72,
                    rationale = "${policy.name} does not automatically cover ${displayIssue(issueType)} in the prototype policy data.",
                    escalationRequired = true,
                )
            val completed =
                existing.copy(
                    status = ClaimStatus.NOT_COVERED,
                    stage = "SMS",
                    coverageDecision = decision,
                    assistanceAction = null,
                    smsPreview = callbackSms(existing.id),
                    updatedAt = Instant.now(),
                )
            claims[id] = completed
            return completed
        }

        val decision =
            CoverageDecision(
                covered = true,
                confidence = 0.91,
                rationale = "${policy.name} covers ${displayIssue(issueType)} and no prototype exclusion was triggered.",
                escalationRequired = false,
            )
        val providerMatch = locationLookupService.matchProvider(actionType, existing.locationResolution)
        val action =
            AssistanceAction(
                actionType = actionType,
                providerName = providerMatch.providerName,
                etaMinutes = providerMatch.etaMinutes,
                customerMessage = "Aster Roadside has assessed your case and arranged the next best assistance step.",
            )
        val completed =
            existing.copy(
                status = ClaimStatus.COMPLETED,
                stage = "SMS",
                coverageDecision = decision,
                providerMatch = providerMatch,
                assistanceAction = action,
                smsPreview = dispatchSms(existing.id, action),
                updatedAt = Instant.now(),
            )

        claims[id] = completed
        return completed
    }

    fun finalizeHumanCallback(
        id: String,
        reason: String = "Caller was routed to human callback.",
    ): ClaimSession = completeHumanCallback(getClaim(id), reason)

    private fun completeHumanCallback(
        existing: ClaimSession,
        reason: String,
    ): ClaimSession {
        val completed =
            existing.copy(
                status = ClaimStatus.NEEDS_HUMAN_CALLBACK,
                stage = "SMS",
                coverageDecision =
                    CoverageDecision(
                        covered = false,
                        confidence = 0.0,
                        rationale = reason,
                        escalationRequired = true,
                    ),
                assistanceAction = null,
                smsPreview = if (isSafetyCancellation(reason)) safetyCallbackSms(existing.id) else callbackSms(existing.id),
                updatedAt = Instant.now(),
            )
        claims[existing.id] = completed
        return completed
    }

    private fun findCustomerByPhone(phone: String) =
        FakeRoadsideData.customers.firstOrNull {
            normalizePhone(it.phoneNumber) == normalizePhone(phone)
        }

    private fun findCustomerById(id: String) =
        FakeRoadsideData.customers.firstOrNull { it.id == id }

    private fun findPolicyById(id: String) =
        FakeRoadsideData.policies.firstOrNull { it.id == id }

    private fun unknownNumberVerificationCustomers() =
        FakeRoadsideData.customers.filter {
            it.demoLabel.equals("Unknown-number verification demo", ignoreCase = true)
        }

    private fun classifyIncident(summary: String): IncidentClassification {
        val canonical = incidentClassifier.classify(summary)
        return IncidentClassification(canonicalType = canonical, rawSummary = summary.trim())
    }

    private fun issueRequiresHumanCallback(issueType: String) =
        issueType in setOf("accident_with_injury", "third_party_caller", "ev_warning")

    private fun humanCallbackReasonForIssue(issueType: String) =
        when (issueType) {
            "ev_warning" -> "The caller reported an EV warning light, which may involve high-voltage or battery safety risk, so the prototype routes this to a roadside specialist."
            "accident_with_injury" -> "The caller reported a possible accident or injury, so the prototype routes this to a roadside specialist."
            "third_party_caller" -> "The caller is not the policyholder, so the prototype routes this to a roadside specialist."
            else -> "The reported incident requires a roadside specialist review."
        }

    private fun actionTypeForIssue(issueType: String) =
        when (issueType) {
            "flat_tire", "dead_battery", "minor_mechanical_fault" -> "repair_truck"
            else -> "tow_truck"
        }

    private fun displayIssue(issueType: String) =
        when (issueType) {
            "flat_tire" -> "a flat tyre"
            "dead_battery" -> "a dead battery"
            "engine_failure" -> "engine failure"
            "lost_keys" -> "lost keys"
            "fuel_issue" -> "a fuel issue"
            "ev_battery_depleted" -> "a depleted EV battery"
            "charging_station_failure" -> "charging station failure"
            "minor_mechanical_fault" -> "a minor mechanical fault"
            else -> issueType.replace('_', ' ')
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
        attemptsRemaining: Int = MAX_PIN_ATTEMPTS - claim.pinVerificationAttempts,
    ) = AuthVerificationResponse(
        verified = verified,
        reason = reason,
        authRisk = claim.authRisk,
        policyholderName = customer?.name.takeIf { verified },
        customerDetails = customer?.takeIf { verified }?.toVerifiedDetails(),
        pinChallengePositions = positions,
        attemptsRemaining = attemptsRemaining.coerceAtLeast(0),
        humanCallbackRequired = claim.status == ClaimStatus.NEEDS_HUMAN_CALLBACK,
        vehicleOptions =
            customer?.vehicles?.takeIf { verified }?.map {
                "${it.year} ${it.make} ${it.model}, registration ${it.registration}"
            } ?: emptyList(),
        nextStep =
            if (!verified && claim.status != ClaimStatus.NEEDS_HUMAN_CALLBACK) {
                NextStepResponse(
                    allowedAction = "retry_pin",
                    question = "Please provide the requested PIN digits again.",
                    reason = reason,
                    blockedActions = listOf("coverage_decision", "dispatch_simulation"),
                )
            } else {
                nextStep(claim.id)
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

    private fun dispatchSms(
        caseRef: String,
        action: AssistanceAction,
    ) = "Aster Roadside: ${action.providerName} is assigned for ${action.actionType.replace('_', ' ')}. ETA ${action.etaMinutes} min. Case ref: $caseRef."

    private fun callbackSms(caseRef: String) =
        "Aster Roadside: Your case has been sent to a roadside specialist. They will call you back as soon as one is available. Case ref: $caseRef. If you are in immediate danger, call emergency services."

    private fun safetyCallbackSms(caseRef: String) =
        "Aster Roadside: We ended the call so you can move to safety. Once you are away from traffic, call us back to continue your roadside request. Case ref: $caseRef. If you are in immediate danger, call emergency services."

    private fun isSafetyCancellation(reason: String) =
        reason.contains("safe place", ignoreCase = true) ||
            reason.contains("safety risk", ignoreCase = true) ||
            reason.contains("move to safety", ignoreCase = true)

    private data class IncidentClassification(
        val canonicalType: String?,
        val rawSummary: String,
    )
}
