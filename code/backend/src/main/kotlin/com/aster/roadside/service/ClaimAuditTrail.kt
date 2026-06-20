package com.aster.roadside.service

import com.aster.roadside.domain.ClaimAuditEvent
import com.aster.roadside.domain.ClaimSession
import java.time.Instant

data class AuditEventDraft(
    val type: String,
    val status: String,
    val label: String,
)

fun caseCreatedEvent(timestamp: Instant) =
    ClaimAuditEvent(
        type = "case.created",
        status = "info",
        label = "Case created",
        createdAt = timestamp,
    )

fun ClaimSession.withAuditEvent(
    type: String,
    status: String,
    label: String,
    timestamp: Instant,
): ClaimSession =
    withAuditEvents(
        listOf(AuditEventDraft(type = type, status = status, label = label)),
        timestamp,
    )

fun ClaimSession.withAuditEvents(
    events: List<AuditEventDraft>,
    timestamp: Instant,
): ClaimSession {
    val newEvents =
        events.filter { event ->
            auditEvents.none {
                it.type == event.type && it.status == event.status && it.label == event.label
            }
        }
    if (newEvents.isEmpty()) return this

    return copy(
        auditEvents =
            auditEvents +
                newEvents.map { event ->
                    ClaimAuditEvent(
                        type = event.type,
                        status = event.status,
                        label = event.label,
                        createdAt = timestamp,
                    )
                },
    )
}
