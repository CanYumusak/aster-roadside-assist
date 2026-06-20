package com.aster.roadside.service

import com.aster.roadside.ai.IncidentClassificationOutput
import com.openai.client.OpenAIClient
import com.openai.client.okhttp.OpenAIOkHttpClient
import com.openai.models.ChatModel
import com.openai.models.chat.completions.ChatCompletionCreateParams
import org.slf4j.LoggerFactory
import org.springframework.core.env.Environment
import org.springframework.stereotype.Service

@Service
open class IncidentClassifier(
    private val environment: Environment,
) {
    private val model =
        environment.getProperty("OPENAI_INCIDENT_MODEL")
            ?.takeIf { it.isNotBlank() }
            ?: environment.getProperty("openai.incident-model")
                ?.takeIf { it.isNotBlank() }
            ?: "gpt-5.4-nano"
    private val client: OpenAIClient? =
        (
            environment.getProperty("OPENAI_API_KEY")
                ?: environment.getProperty("openai.api-key")
                ?: System.getenv("OPENAI_API_KEY")
        )
            ?.takeIf { it.isNotBlank() }
            ?.let { OpenAIOkHttpClient.builder().apiKey(it).build() }

    open fun classify(summary: String): String? {
        if (summary.isBlank()) return null
        val openAiClient = client
        if (openAiClient == null) {
            log.warn("incident_classifier_skipped reason=missing_openai_api_key")
            return null
        }

        return runCatching {
            val params =
                ChatCompletionCreateParams
                    .builder()
                    .model(ChatModel.of(model))
                    .temperature(0.0)
                    .maxCompletionTokens(80)
                    .addSystemMessage(INSTRUCTIONS)
                    .addUserMessage("Caller incident description: ${summary.trim()}")
                    .responseFormat(IncidentClassificationOutput::class.java)
                    .build()

            val output: IncidentClassificationOutput? =
                openAiClient
                    .chat()
                    .completions()
                    .create(params)
                    .choices()
                    .stream()
                    .flatMap { it.message().content().stream() }
                    .findFirst()
                    .orElse(null)

            val incidentType =
                output
                    ?.incidentType
                    ?.takeUnless { it == IncidentClassificationOutput.IncidentType.NONE }
                    ?.toCanonical()
            log.info("incident_classification model={} raw='{}' canonical='{}'", model, summary, incidentType)
            incidentType
        }.getOrElse { error ->
            log.warn("incident_classifier_failed model={} reason={}", model, error.message)
            null
        }
    }

    private fun IncidentClassificationOutput.IncidentType.toCanonical() =
        name.lowercase()

    private companion object {
        val log = LoggerFactory.getLogger(IncidentClassifier::class.java)

        const val INSTRUCTIONS =
            """
Classify a caller's roadside-assistance incident into exactly one enum value. Use NONE if it is too vague.

Use only the caller's incident description. Do not infer from policy data, location, or demo scenario text.

Enum meanings:
- NONE: no clear roadside incident is described.
- FLAT_TIRE: flat tyre/tire, puncture, blowout, burst tyre, wheel tyre problem.
- DEAD_BATTERY: dead/flat battery, jump start needed, car will not start, clicking starter.
- ENGINE_FAILURE: engine failed, engine cut out, overheating, smoke/steam, loss of power, vehicle broke down.
- LOST_KEYS: lost keys, locked out, keys inside vehicle, snapped/broken key.
- FUEL_ISSUE: out of fuel, wrong fuel, misfuel, empty tank.
- EV_WARNING: red EV/high-voltage/battery warning or safety-critical electric fault.
- EV_BATTERY_DEPLETED: EV ran out of charge or cannot charge because battery is depleted.
- CHARGING_STATION_FAILURE: charger or charging station failed while the vehicle still has enough charge to be safe.
- MINOR_MECHANICAL_FAULT: warning light, brake issue, strange noise, leaking fluid, non-safety mechanical fault.
- ACCIDENT_WITH_INJURY: accident, collision, crash, car was hit, airbag, injury, possible injury, or caller says someone is hurt.
- THIRD_PARTY_CALLER: the only incident information is that the caller is calling for someone else.
"""
    }
}
