package com.aster.roadside.web

import com.aster.roadside.data.FakeRoadsideData
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api")
class RoadsideController {
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

    private fun normalizePhone(phone: String) = phone.filter { it.isDigit() || it == '+' }
}
