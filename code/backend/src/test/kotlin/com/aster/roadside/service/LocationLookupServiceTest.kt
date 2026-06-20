package com.aster.roadside.service

import com.aster.roadside.data.FakeRoadsideData
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import org.springframework.mock.env.MockEnvironment

class LocationLookupServiceTest {
    @Test
    fun `presenter guide locations are road-style but still dispatchable in prototype resolver`() {
        val service = LocationLookupService(NoGoogleLocationClient())

        FakeRoadsideData.scenarios.forEach { scenario ->
            val resolution =
                service.resolve(
                    LocationEvidence(
                        previousLocationText = null,
                        spokenLocation = scenario.locationPrompt,
                        callerConfirmedCandidate = false,
                        previousResolution = null,
                    ),
                )

            assertThat(scenario.locationPrompt)
                .`as`("${scenario.id} should not depend on callers knowing a full postcode")
                .doesNotContainPattern("\\b[A-Z]{1,2}\\d[A-Z\\d]?\\s*\\d[A-Z]{2}\\b")
            assertThat(resolution)
                .`as`("${scenario.id} should resolve from road, area, or landmark detail")
                .isNotNull
            assertThat(resolution!!.dispatchable)
                .`as`("${scenario.id} should be dispatchable")
                .isTrue
        }
    }

    @Test
    fun `presenter guide locations resolve through Google Places when configured`() {
        val apiKey = System.getenv("GOOGLE_MAPS_API_KEY")
        assumeTrue(!apiKey.isNullOrBlank(), "GOOGLE_MAPS_API_KEY is required for the Google Places integration test")

        val service =
            LocationLookupService(
                GoogleMapsLocationClient(MockEnvironment().withProperty("GOOGLE_MAPS_API_KEY", apiKey)),
            )

        FakeRoadsideData.scenarios.forEach { scenario ->
            val firstResolution =
                service.resolve(
                    LocationEvidence(
                        previousLocationText = null,
                        spokenLocation = scenario.locationPrompt,
                        callerConfirmedCandidate = false,
                        previousResolution = null,
                    ),
                )

            assertThat(firstResolution)
                .`as`("${scenario.id} should return either a dispatchable place or useful candidates")
                .isNotNull

            val finalResolution =
                if (firstResolution!!.dispatchable) {
                    firstResolution
                } else {
                    resolveWithClarificationOrCandidate(service, scenario.id, scenario.locationPrompt, firstResolution)
                }

            assertThat(finalResolution.dispatchable)
                .`as`("${scenario.id} should become dispatchable after at most one clarification")
                .isTrue
            assertThat(finalResolution.googleMapsUri)
                .`as`("${scenario.id} should include a Google Maps link")
                .isNotBlank()
        }
    }

    private fun resolveWithClarificationOrCandidate(
        service: LocationLookupService,
        scenarioId: String,
        originalPrompt: String,
        firstResolution: com.aster.roadside.domain.LocationResolution,
    ): com.aster.roadside.domain.LocationResolution {
        val clarified =
            service.resolve(
                LocationEvidence(
                    previousLocationText = originalPrompt,
                    spokenLocation = clarificationByScenario.getValue(scenarioId),
                    callerConfirmedCandidate = false,
                    previousResolution = firstResolution,
                ),
            )

        if (clarified?.dispatchable == true) return clarified

        val confirmedCandidate = firstResolution.candidateAddresses.firstOrNull()
        assertThat(confirmedCandidate)
            .`as`("$scenarioId should expose a candidate the caller can confirm")
            .isNotBlank()

        return service.resolve(
            LocationEvidence(
                previousLocationText = originalPrompt,
                spokenLocation = confirmedCandidate,
                callerConfirmedCandidate = true,
                previousResolution = firstResolution,
            ),
        )!!
    }

    private companion object {
        val clarificationByScenario =
            mapOf(
                "scenario-flat-tyre-safe" to "M40 services",
                "scenario-motorway-engine-failure" to "Reading services westbound",
                "scenario-dead-battery" to "Calverley Street",
                "scenario-ev-warning" to "Newfoundland Street",
                "scenario-possible-injury" to "Gonville Place",
                "scenario-non-policyholder" to "Oxford A34",
            )
    }

    private class NoGoogleLocationClient : GoogleMapsLocationClient(MockEnvironment()) {
        override fun resolve(rawLocation: String): GoogleLocationResult? = null
    }
}
