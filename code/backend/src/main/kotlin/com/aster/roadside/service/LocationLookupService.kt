package com.aster.roadside.service

import com.aster.roadside.domain.LocationResolution
import com.aster.roadside.domain.ProviderMatch
import org.springframework.stereotype.Service

@Service
class LocationLookupService(
    private val googleMapsLocationClient: GoogleMapsLocationClient,
) {
    fun resolve(rawLocation: String?): LocationResolution? {
        val value = rawLocation?.trim().orEmpty()
        if (value.isBlank()) return null

        googleMapsLocationClient.resolve(value)?.let { googleResult ->
            if (googleResult.ambiguous) {
                return LocationResolution(
                    rawLocation = value,
                    normalizedArea = "Multiple Google Maps matches",
                    dispatchable = false,
                    confidence = 0.58,
                    rationale = "Google Places returned multiple possible matches. Ask for a street name, postcode, nearby junction, or another landmark.",
                    candidateAddresses = googleResult.candidateAddresses,
                    source = "google_places_text_search",
                )
            }

            return LocationResolution(
                rawLocation = value,
                normalizedArea = googleResult.normalizedArea,
                dispatchable = true,
                confidence = 0.92,
                rationale = "Resolved to a UK dispatch location with Google Places Text Search.",
                formattedAddress = googleResult.formattedAddress,
                latitude = googleResult.latitude,
                longitude = googleResult.longitude,
                googleMapsUri = googleResult.googleMapsUri,
                placeId = googleResult.placeId,
                candidateAddresses = googleResult.candidateAddresses,
                source = "google_places_text_search",
                requiresCallerConfirmation = true,
            )
        }

        val normalizedArea =
            when {
                value.contains("m4", ignoreCase = true) || value.contains("reading", ignoreCase = true) -> "M4 / Reading"
                value.contains("a34", ignoreCase = true) || value.contains("oxford", ignoreCase = true) -> "A34 / Oxford"
                value.contains("bristol", ignoreCase = true) || value.contains("bs8", ignoreCase = true) -> "Bristol"
                value.contains("leeds", ignoreCase = true) || value.contains("ls1", ignoreCase = true) -> "Leeds"
                value.contains("clapham", ignoreCase = true) || value.contains("sw11", ignoreCase = true) -> "South West London"
                else -> "Unmapped spoken location"
            }

        val dispatchable =
            normalizedArea != "Unmapped spoken location" ||
                UK_POSTCODE_OR_OUTWARD.containsMatchIn(value) ||
                ROAD_NUMBER.containsMatchIn(value) ||
                NAMED_ROAD.containsMatchIn(value) ||
                NUMBERED_JUNCTION_OR_SERVICES.containsMatchIn(value)

        return LocationResolution(
            rawLocation = value,
            normalizedArea = normalizedArea,
            dispatchable = dispatchable,
            confidence = if (dispatchable) 0.84 else 0.42,
            rationale = if (dispatchable) {
                "Spoken location contains enough road, area, or postcode detail for prototype dispatch lookup."
            } else {
                "Location needs a road, junction, landmark, service area, or postcode before dispatch simulation."
            },
            source = "synthetic",
        )
    }

    fun matchProvider(
        actionType: String,
        locationResolution: LocationResolution?,
    ): ProviderMatch {
        val area = locationResolution?.normalizedArea.orEmpty()
        val providerName =
            when {
                actionType == "tow_truck" && area.contains("M4") -> "National Highway Recovery"
                actionType == "tow_truck" -> "Aster Recovery Network"
                actionType == "repair_truck" && area.contains("London") -> "Westline Mobile Repair"
                actionType == "repair_truck" -> "Aster Mobile Technician"
                else -> "Aster Specialist Team"
            }

        val eta =
            when {
                actionType == "tow_truck" && area.contains("M4") -> 42
                actionType == "tow_truck" -> 48
                actionType == "repair_truck" -> 35
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
        val ROAD_NUMBER = Regex("\\b[ABM]\\d{1,4}\\b", RegexOption.IGNORE_CASE)
        val NAMED_ROAD = Regex("\\b(road|street|lane|hill|drive|avenue|way|roundabout|car park|lay-by|layby)\\b", RegexOption.IGNORE_CASE)
        val NUMBERED_JUNCTION_OR_SERVICES = Regex("\\b(junction|jct|services|service area)\\s*\\d*\\b", RegexOption.IGNORE_CASE)
    }
}
