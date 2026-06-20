package com.aster.roadside.web

import com.aster.roadside.domain.AppendTranscriptRequest
import com.aster.roadside.domain.AppendToolCallTraceRequest
import com.aster.roadside.domain.CancellationRequest
import com.aster.roadside.domain.CreateClaimRequest
import com.aster.roadside.domain.HumanCallbackRequest
import com.aster.roadside.domain.UpdateFactsRequest
import com.aster.roadside.domain.VerifyKnownPinRequest
import com.aster.roadside.domain.VerifyUnknownIdentityRequest
import com.aster.roadside.service.ClaimService
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/claims")
class ClaimsController(
    private val claimService: ClaimService,
) {
    @PostMapping
    fun createClaim(
        @RequestBody request: CreateClaimRequest,
    ) = ResponseEntity.status(HttpStatus.CREATED).body(claimService.createClaim(request))

    @GetMapping
    fun claims() = claimService.listClaims()

    @GetMapping("/{id}")
    fun getClaim(
        @PathVariable id: String,
    ) = claimService.getClaim(id)

    @PostMapping("/{id}/facts")
    fun updateFacts(
        @PathVariable id: String,
        @RequestBody request: UpdateFactsRequest,
    ) = claimService.updateFacts(id, request)

    @PostMapping("/{id}/transcript")
    fun appendTranscript(
        @PathVariable id: String,
        @RequestBody request: AppendTranscriptRequest,
    ) = claimService.appendTranscript(id, request.speaker, request.text)

    @PostMapping("/{id}/tool-calls")
    fun appendToolCallTrace(
        @PathVariable id: String,
        @RequestBody request: AppendToolCallTraceRequest,
    ) = claimService.appendToolCallTrace(id, request)

    @PostMapping("/{id}/verify-known-pin")
    fun verifyKnownPin(
        @PathVariable id: String,
        @RequestBody request: VerifyKnownPinRequest,
    ) = claimService.verifyKnownPin(id, request)

    @PostMapping("/{id}/verify-unknown-identity")
    fun verifyUnknownIdentity(
        @PathVariable id: String,
        @RequestBody request: VerifyUnknownIdentityRequest,
    ) = claimService.verifyUnknownIdentity(id, request)

    @PostMapping("/{id}/next-step")
    fun nextStep(
        @PathVariable id: String,
    ) = claimService.nextStep(id)

    @PostMapping("/{id}/finalize")
    fun finalizeClaim(
        @PathVariable id: String,
    ) = claimService.finalizeClaim(id)

    @PostMapping("/{id}/human-callback")
    fun humanCallback(
        @PathVariable id: String,
        @RequestBody request: HumanCallbackRequest,
    ) = claimService.finalizeHumanCallback(id, request.reason)

    @PostMapping("/{id}/cancel")
    fun cancel(
        @PathVariable id: String,
        @RequestBody request: CancellationRequest,
    ) = claimService.finalizeCancellation(id, request.reason)
}
