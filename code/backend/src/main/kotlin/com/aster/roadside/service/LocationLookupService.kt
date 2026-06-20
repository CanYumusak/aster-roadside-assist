package com.aster.roadside.service

import com.aster.roadside.domain.AssistanceActionType
import com.aster.roadside.domain.LocationResolution
import com.aster.roadside.domain.ProviderMatch
import org.springframework.stereotype.Service

@Service
class LocationLookupService(
    private val googleMapsLocationClient: GoogleMapsLocationClient,
) {
    fun resolve(evidence: LocationEvidence): LocationResolution? {
        if (evidence.spokenLocation.isNullOrBlank()) return evidence.previousResolution
        val resolutionInput = evidence.toResolutionInput()
        return resolve(
            rawLocation = resolutionInput.query,
            callerConfirmedCandidate = resolutionInput.callerConfirmedCandidate,
            acceptSingleMatchWithoutConfirmation = resolutionInput.acceptSingleMatchWithoutConfirmation,
        )
    }

    fun resolve(
        rawLocation: String?,
        callerConfirmedCandidate: Boolean = false,
        acceptSingleMatchWithoutConfirmation: Boolean = false,
    ): LocationResolution? {
        val value = rawLocation?.trim().orEmpty()
        if (value.isBlank()) return null

        googleMapsLocationClient.resolve(value)?.let { googleResult ->
            if (googleResult.ambiguous && !callerConfirmedCandidate) {
                return LocationResolution(
                    rawLocation = value,
                    normalizedArea = "Multiple Google Maps matches",
                    dispatchable = false,
                    confidence = 0.58,
                    rationale = "Google Places returned multiple possible matches. Ask the caller to confirm a candidate, or describe a nearby road, junction, shop, landmark, or rough area.",
                    candidateAddresses = googleResult.candidateAddresses,
                    source = "google_places_text_search",
                )
            }

            return LocationResolution(
                rawLocation = value,
                normalizedArea = googleResult.normalizedArea,
                dispatchable = true,
                confidence = if (callerConfirmedCandidate || acceptSingleMatchWithoutConfirmation) 0.9 else 0.92,
                rationale =
                    if (callerConfirmedCandidate) {
                        "Caller selected or confirmed a Google Places candidate for dispatch."
                    } else if (acceptSingleMatchWithoutConfirmation) {
                        "Caller clarified an ambiguous location and Google Places returned a single dispatchable match."
                    } else {
                        "Resolved to a UK dispatch location with Google Places Text Search."
                    },
                formattedAddress = googleResult.formattedAddress,
                latitude = googleResult.latitude,
                longitude = googleResult.longitude,
                googleMapsUri = googleResult.googleMapsUri,
                placeId = googleResult.placeId,
                candidateAddresses = googleResult.candidateAddresses,
                source = "google_places_text_search",
                requiresCallerConfirmation = !callerConfirmedCandidate && !acceptSingleMatchWithoutConfirmation,
            )
        }

        val postcode = UK_POSTCODE_OR_OUTWARD.find(value)?.value?.uppercase()
        val normalizedArea =
            when {
                value.contains("m4", ignoreCase = true) || value.contains("reading", ignoreCase = true) -> "M4 / Reading"
                value.contains("a34", ignoreCase = true) || value.contains("oxford", ignoreCase = true) -> "A34 / Oxford"
                value.contains("bristol", ignoreCase = true) ||
                    value.contains("cabot circus", ignoreCase = true) ||
                    value.contains("newfoundland street", ignoreCase = true) ||
                    value.contains("bs8", ignoreCase = true) -> "Bristol"
                value.contains("leeds", ignoreCase = true) || value.contains("ls1", ignoreCase = true) -> "Leeds"
                value.contains("clapham", ignoreCase = true) || value.contains("sw11", ignoreCase = true) -> "South West London"
                value.contains("beaconsfield", ignoreCase = true) || value.contains("hp9", ignoreCase = true) -> "Beaconsfield"
                value.contains("cambridge", ignoreCase = true) || value.contains("cb1", ignoreCase = true) -> "Cambridge"
                value.contains("brighton", ignoreCase = true) || value.contains("bn2", ignoreCase = true) -> "Brighton"
                value.contains("stafford", ignoreCase = true) || value.contains("st15", ignoreCase = true) -> "Stafford"
                value.contains("stevenage", ignoreCase = true) || value.contains("sg1", ignoreCase = true) -> "Stevenage"
                postcode != null -> "Postcode $postcode"
                else -> "Unmapped spoken location"
            }

        val dispatchable = normalizedArea != "Unmapped spoken location"

        return LocationResolution(
            rawLocation = value,
            normalizedArea = normalizedArea,
            dispatchable = dispatchable,
            confidence = if (dispatchable) 0.84 else 0.42,
            rationale = if (dispatchable) {
                "Spoken location contains enough road, area, or landmark detail for prototype dispatch lookup."
            } else {
                "Location needs a nearby road, junction, service area, shop, landmark, or rough area before dispatch simulation."
            },
            source = "synthetic",
        )
    }

    fun matchProvider(
        actionType: AssistanceActionType,
        locationResolution: LocationResolution?,
    ): ProviderMatch {
        val area = locationResolution?.normalizedArea.orEmpty()
        val providerName =
            when {
                actionType == AssistanceActionType.TOW_TRUCK && area.contains("M4") -> "National Highway Recovery"
                actionType == AssistanceActionType.TOW_TRUCK -> "Aster Recovery Network"
                actionType == AssistanceActionType.REPAIR_TRUCK && area.contains("London") -> "Westline Mobile Repair"
                actionType == AssistanceActionType.REPAIR_TRUCK -> "Aster Mobile Technician"
                else -> "Aster Specialist Team"
            }

        val eta =
            when {
                actionType == AssistanceActionType.TOW_TRUCK && area.contains("M4") -> 42
                actionType == AssistanceActionType.TOW_TRUCK -> 48
                actionType == AssistanceActionType.REPAIR_TRUCK -> 35
                else -> 15
            }

        return ProviderMatch(
            providerName = providerName,
            actionType = actionType,
            etaMinutes = eta,
            rationale = "Matched from synthetic provider coverage for ${area.ifBlank { "unknown area" }}.",
        )
    }

    private companion object {
        val UK_POSTCODE_OR_OUTWARD = Regex("\\b[A-Z]{1,2}\\d[A-Z\\d]?(?:\\s*\\d[A-Z]{2})?\\b", RegexOption.IGNORE_CASE)
    }
}

data class LocationEvidence(
    val previousLocationText: String?,
    val spokenLocation: String?,
    val callerConfirmedCandidate: Boolean,
    val previousResolution: LocationResolution?,
) {
    val callerClarifiedAmbiguousLocation: Boolean =
        !spokenLocation.isNullOrBlank() &&
            spokenLocation != previousLocationText &&
            previousResolution?.dispatchable == false &&
            previousResolution.candidateAddresses.size > 1

    fun toResolutionInput(): LocationResolutionInput {
        val spoken = spokenLocation?.trim().orEmpty()
        return LocationResolutionInput(
            query = if (callerConfirmedCandidate) spoken else clarifiedQuery(spoken),
            callerConfirmedCandidate = callerConfirmedCandidate,
            acceptSingleMatchWithoutConfirmation = callerClarifiedAmbiguousLocation,
        )
    }

    private fun clarifiedQuery(spoken: String): String {
        val previous = previousResolution?.rawLocation?.trim().orEmpty()
        return if (callerClarifiedAmbiguousLocation && previous.isNotBlank()) {
            "$previous $spoken"
        } else {
            spoken
        }
    }
}

data class LocationResolutionInput(
    val query: String,
    val callerConfirmedCandidate: Boolean,
    val acceptSingleMatchWithoutConfirmation: Boolean,
)
