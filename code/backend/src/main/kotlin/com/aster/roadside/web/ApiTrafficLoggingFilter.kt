package com.aster.roadside.web

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import org.springframework.web.util.ContentCachingRequestWrapper
import org.springframework.web.util.ContentCachingResponseWrapper

@Component
class ApiTrafficLoggingFilter : OncePerRequestFilter() {
    override fun shouldNotFilter(request: HttpServletRequest): Boolean =
        !request.requestURI.startsWith("/api/")

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val wrappedRequest = ContentCachingRequestWrapper(request, MAX_LOG_BODY_CHARS)
        val wrappedResponse = ContentCachingResponseWrapper(response)
        val startedAt = System.currentTimeMillis()

        try {
            filterChain.doFilter(wrappedRequest, wrappedResponse)
        } finally {
            val durationMs = System.currentTimeMillis() - startedAt
            val requestBody = wrappedRequest.contentAsByteArray.toUtf8()
            val responseBody = wrappedResponse.contentAsByteArray.toUtf8()

            log.info(
                "api_traffic method={} path={} status={} durationMs={} request={} response={}",
                request.method,
                request.requestURI,
                wrappedResponse.status,
                durationMs,
                requestBody.toLogBody(request.requestURI),
                responseBody.toLogBody(request.requestURI),
            )
            wrappedResponse.copyBodyToResponse()
        }
    }

    private fun ByteArray.toUtf8(): String =
        if (isEmpty()) "" else String(this, Charsets.UTF_8)

    private fun String.toLogBody(path: String): String {
        if (isBlank()) return ""
        if (path == "/api/customers") return "[customer list redacted]"
        if (path == "/api/policies") return "[policy list omitted]"
        if (path == "/api/scenarios") return "[scenario list omitted]"

        return this
            .replace(Regex(""""roadsidePin"\s*:\s*"[^"]*"""")) {
                """"roadsidePin":"[redacted]""""
            }
            .replace(Regex(""""pin"\s*:\s*"[^"]*"""")) {
                """"pin":"[redacted]""""
            }
            .take(MAX_LOG_BODY_CHARS)
            .let { if (length > MAX_LOG_BODY_CHARS) "$it...[truncated]" else it }
    }

    private companion object {
        const val MAX_LOG_BODY_CHARS = 1_500
        val log = LoggerFactory.getLogger(ApiTrafficLoggingFilter::class.java)
    }
}
