package com.aster.roadside.web

import com.aster.roadside.data.FakeRoadsideData
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
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api")
class RoadsideController(
    private val claimService: ClaimService,
) {
    @GetMapping("/customers")
    fun customers() = FakeRoadsideData.customers

    @GetMapping("/customers/lookup")
    fun lookupCustomer(
        @RequestParam phone: String,
    ) = FakeRoadsideData.customers.firstOrNull {
        normalizePhone(it.phoneNumber) == normalizePhone(phone)
    }

    @GetMapping("/policies")
    fun policies() = FakeRoadsideData.policies

    @GetMapping("/scenarios")
    fun scenarios() = FakeRoadsideData.scenarios

    @PostMapping("/claims")
    fun createClaim(
        @RequestBody request: CreateClaimRequest,
    ) = ResponseEntity.status(HttpStatus.CREATED).body(claimService.createClaim(request))

    @GetMapping("/claims/{id}")
    fun getClaim(
        @PathVariable id: String,
    ) = claimService.getClaim(id)

    @PostMapping("/claims/{id}/facts")
    fun updateFacts(
        @PathVariable id: String,
        @RequestBody request: UpdateFactsRequest,
    ) = claimService.updateFacts(id, request)

    @PostMapping("/claims/{id}/verify-known-pin")
    fun verifyKnownPin(
        @PathVariable id: String,
        @RequestBody request: VerifyKnownPinRequest,
    ) = claimService.verifyKnownPin(id, request)

    @PostMapping("/claims/{id}/verify-unknown-identity")
    fun verifyUnknownIdentity(
        @PathVariable id: String,
        @RequestBody request: VerifyUnknownIdentityRequest,
    ) = claimService.verifyUnknownIdentity(id, request)

    @PostMapping("/claims/{id}/next-step")
    fun nextStep(
        @PathVariable id: String,
    ) = claimService.nextStep(id)

    @PostMapping("/claims/{id}/finalize")
    fun finalizeClaim(
        @PathVariable id: String,
    ) = claimService.finalizeClaim(id)

    @PostMapping("/claims/{id}/human-callback")
    fun humanCallback(
        @PathVariable id: String,
        @RequestBody request: HumanCallbackRequest,
    ) = claimService.finalizeHumanCallback(id, request.reason)

    private fun normalizePhone(phone: String) = phone.filter { it.isDigit() || it == '+' }
}
