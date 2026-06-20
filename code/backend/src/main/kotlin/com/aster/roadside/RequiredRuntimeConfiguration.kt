package com.aster.roadside

import org.springframework.beans.factory.InitializingBean
import org.springframework.core.env.Environment
import org.springframework.stereotype.Component

@Component
class RequiredRuntimeConfiguration(
    private val environment: Environment,
) : InitializingBean {
    override fun afterPropertiesSet() {
        val missing =
            REQUIRED_KEYS
                .filterNot { candidates -> candidates.any(::hasValue) }
                .map { candidates -> candidates.first() }

        check(missing.isEmpty()) {
            "Missing required backend runtime configuration: ${missing.joinToString(", ")}. " +
                "Set these before starting the backend; the voice demo needs them for incident classification and location resolution."
        }
    }

    private fun hasValue(key: String) =
        !environment.getProperty(key).isNullOrBlank() || !System.getenv(key).isNullOrBlank()

    private companion object {
        val REQUIRED_KEYS =
            listOf(
                listOf("OPENAI_API_KEY", "openai.api-key"),
                listOf("GOOGLE_MAPS_API_KEY", "google.maps.api-key"),
            )
    }
}
