package com.aster.roadside.service

import org.slf4j.LoggerFactory
import org.springframework.core.env.Environment
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClient

@Service
class GoogleMapsLocationClient(
    private val environment: Environment,
) {
    private val restClient = RestClient.create()

    fun resolve(rawLocation: String): GoogleLocationResult? {
        val value = rawLocation.trim()
        if (value.isBlank() || containsNonUkHint(value)) return null

        val key = apiKey() ?: return null
        return runCatching {
            val response: Map<*, *>? =
                restClient
                    .post()
                    .uri(PLACES_TEXT_SEARCH_URL)
                    .header("Content-Type", "application/json")
                    .header("X-Goog-Api-Key", key)
                    .header("X-Goog-FieldMask", FIELD_MASK)
                    .body(textSearchBody(value))
                    .retrieve()
                    .body(Map::class.java)

            val acceptedResults =
                response
                ?.get("places")
                ?.asList()
                ?.mapNotNull(::toAcceptedResult)
                .orEmpty()

            when (acceptedResults.size) {
                0 -> null
                1 -> acceptedResults.first()
                else -> acceptedResults.first().asAmbiguous(acceptedResults.map { it.formattedAddress })
            }
        }.onFailure {
            log.info("google_location_lookup_failed reason={}", it.javaClass.simpleName)
        }.getOrNull()
    }

    private fun toAcceptedResult(place: Any?): GoogleLocationResult? {
        val record = place as? Map<*, *> ?: return null
        val formattedAddress = record["formattedAddress"] as? String ?: return null
        val location = record["location"] as? Map<*, *> ?: return null
        val latitude = (location["latitude"] as? Number)?.toDouble() ?: return null
        val longitude = (location["longitude"] as? Number)?.toDouble() ?: return null

        val countryCode = countryCode(record["addressComponents"].asList())
        if (countryCode != null && countryCode != "GB") return null
        if (!isInsideUk(latitude, longitude)) return null

        val displayName =
            ((record["displayName"] as? Map<*, *>)?.get("text") as? String)
                ?.takeIf { it.isNotBlank() }
        val mapsUri =
            (record["googleMapsUri"] as? String)
                ?: "https://www.google.com/maps/search/?api=1&query=$latitude,$longitude"

        return GoogleLocationResult(
            formattedAddress = formattedAddress,
            normalizedArea = areaFromAddress(formattedAddress),
            latitude = latitude,
            longitude = longitude,
            googleMapsUri = mapsUri,
            placeId = record["id"] as? String,
            displayName = displayName,
            candidateAddresses = listOf(formattedAddress),
        )
    }

    private fun countryCode(components: List<Any?>): String? =
        components.firstNotNullOfOrNull { component ->
            val record = component as? Map<*, *> ?: return@firstNotNullOfOrNull null
            val types = record["types"].asList().mapNotNull { it as? String }
            if ("country" in types) record["shortText"] as? String else null
        }

    private fun areaFromAddress(address: String): String =
        when {
            address.contains("London", ignoreCase = true) -> "London"
            address.contains("Reading", ignoreCase = true) -> "Reading"
            address.contains("Oxford", ignoreCase = true) -> "Oxford"
            address.contains("Bristol", ignoreCase = true) -> "Bristol"
            address.contains("Leeds", ignoreCase = true) -> "Leeds"
            else -> address.split(',').dropLast(1).lastOrNull()?.trim().orEmpty().ifBlank { "Resolved by Google Maps" }
        }

    private fun textSearchBody(query: String) =
        mapOf(
            "textQuery" to query,
            "regionCode" to "GB",
            "languageCode" to "en",
            "pageSize" to 3,
            "locationBias" to
                mapOf(
                    "rectangle" to
                        mapOf(
                            "low" to mapOf("latitude" to 49.8, "longitude" to -8.7),
                            "high" to mapOf("latitude" to 60.9, "longitude" to 1.9),
                        ),
                ),
        )

    private fun apiKey(): String? =
        environment.getProperty("GOOGLE_MAPS_API_KEY")
            ?: environment.getProperty("google.maps.api-key")
            ?: System.getenv("GOOGLE_MAPS_API_KEY")

    private fun containsNonUkHint(value: String): Boolean {
        val normalized = value.lowercase()
        return NON_UK_HINTS.any { Regex("\\b${Regex.escape(it)}\\b").containsMatchIn(normalized) }
    }

    private fun isInsideUk(
        latitude: Double,
        longitude: Double,
    ) = latitude in 49.8..60.9 && longitude in -8.7..1.9

    private fun Any?.asList(): List<Any?> = this as? List<Any?> ?: emptyList()

    private companion object {
        const val PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
        const val FIELD_MASK =
            "places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.addressComponents"
        val NON_UK_HINTS =
            setOf(
                "berlin",
                "germany",
                "deutschland",
                "paris",
                "france",
                "spain",
                "italy",
                "usa",
                "united states",
            )
        val log = LoggerFactory.getLogger(GoogleMapsLocationClient::class.java)
    }
}

data class GoogleLocationResult(
    val formattedAddress: String,
    val normalizedArea: String,
    val latitude: Double,
    val longitude: Double,
    val googleMapsUri: String,
    val placeId: String?,
    val displayName: String?,
    val candidateAddresses: List<String>,
    val ambiguous: Boolean = false,
) {
    fun asAmbiguous(candidateAddresses: List<String>) =
        copy(
            candidateAddresses = candidateAddresses.distinct().take(5),
            ambiguous = true,
        )
}
