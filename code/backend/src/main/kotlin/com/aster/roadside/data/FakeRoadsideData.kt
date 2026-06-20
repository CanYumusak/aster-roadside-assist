package com.aster.roadside.data

import com.aster.roadside.domain.Customer
import com.aster.roadside.domain.Policy
import com.aster.roadside.domain.Scenario
import com.aster.roadside.domain.Vehicle

object FakeRoadsideData {
    val policies: List<Policy> =
        listOf(
            Policy(
                id = "policy-roadside-plus-001",
                name = "Roadside Plus",
                summary = "Full UK roadside assistance for common breakdowns, towing, and onward travel.",
                coverageTier = "plus",
                coveredEvents = listOf("flat_tire", "dead_battery", "engine_failure", "lost_keys", "fuel_issue", "minor_mechanical_fault"),
                assistanceBenefits = mapOf("roadsideRepair" to true, "towToNearestGarage" to true, "towToHome" to true, "taxi" to true, "rentalCar" to true),
                limits = mapOf("maxTowDistanceKm" to 80, "maxTaxiCostGbp" to 120, "maxRentalDays" to 2, "annualCalloutLimit" to 5),
                exclusions = listOf("accident_with_injury", "intentional_damage", "vehicle_used_for_racing", "breakdown_outside_uk"),
                escalationRules = listOf("injury_reported", "customer_in_unsafe_location", "policy_match_confidence_below_0_75"),
            ),
            Policy(
                id = "policy-roadside-basic-002",
                name = "Roadside Basic",
                summary = "Entry-level roadside assistance covering local roadside repair and limited towing.",
                coverageTier = "basic",
                coveredEvents = listOf("flat_tire", "dead_battery", "minor_mechanical_fault"),
                assistanceBenefits = mapOf("roadsideRepair" to true, "towToNearestGarage" to true, "towToHome" to false, "taxi" to false, "rentalCar" to false),
                limits = mapOf("maxTowDistanceKm" to 25, "maxTaxiCostGbp" to 0, "maxRentalDays" to 0, "annualCalloutLimit" to 3),
                exclusions = listOf("engine_failure_requiring_long_distance_tow", "accident_with_injury", "lost_keys", "fuel_issue", "breakdown_at_home", "breakdown_outside_uk"),
                escalationRules = listOf("injury_reported", "customer_in_unsafe_location", "tow_distance_above_limit", "requested_benefit_not_in_policy"),
            ),
            Policy(
                id = "policy-electric-ev-003",
                name = "EV Assist",
                summary = "Roadside assistance tailored to electric vehicles, including battery and charging support.",
                coverageTier = "ev",
                coveredEvents = listOf("flat_tire", "dead_battery", "ev_battery_depleted", "charging_station_failure", "minor_mechanical_fault", "software_lockout"),
                assistanceBenefits = mapOf("roadsideRepair" to true, "towToNearestGarage" to true, "towToChargingStation" to true, "towToHome" to true, "taxi" to true, "rentalCar" to true),
                limits = mapOf("maxTowDistanceKm" to 100, "maxTaxiCostGbp" to 150, "maxRentalDays" to 2, "annualCalloutLimit" to 6),
                exclusions = listOf("accident_with_injury", "vehicle_modified_battery_system", "commercial_delivery_use", "breakdown_outside_uk"),
                escalationRules = listOf("injury_reported", "customer_in_unsafe_location", "high_voltage_warning_reported", "battery_damage_suspected"),
            ),
            Policy(
                id = "policy-european-premier-004",
                name = "European Premier",
                summary = "Premium roadside assistance for UK and European travel with broad onward mobility support.",
                coverageTier = "premier",
                coveredEvents = listOf("flat_tire", "dead_battery", "engine_failure", "lost_keys", "fuel_issue", "minor_mechanical_fault", "breakdown_outside_uk"),
                assistanceBenefits = mapOf("roadsideRepair" to true, "towToNearestGarage" to true, "towToHome" to true, "taxi" to true, "rentalCar" to true, "overnightAccommodation" to true),
                limits = mapOf("maxTowDistanceKm" to 250, "maxTaxiCostGbp" to 250, "maxRentalDays" to 5, "annualCalloutLimit" to 8),
                exclusions = listOf("accident_with_injury", "vehicle_used_for_racing", "known_pre_existing_fault", "driver_without_valid_license"),
                escalationRules = listOf("injury_reported", "customer_in_unsafe_location", "cross_border_repatriation_needed"),
            ),
        )

    val customers: List<Customer> =
        listOf(
            customer("cust-001", "Single car - common family hatchback", "Amelia Hart", "1986-04-17", "+447700900101", "482759", "SW11 2AA", vehicle("veh-001-a", "LD21 XKP", "Ford", "Focus", 2021, "Blue", "petrol", "policy-roadside-plus-001")),
            customer("cust-002", "Single car - basic roadside cover", "James Okafor", "1979-11-03", "+447700900102", "619284", "M20 3DX", vehicle("veh-002-a", "MJ18 LVA", "Volkswagen", "Golf", 2018, "Silver", "diesel", "policy-roadside-basic-002")),
            customer("cust-003", "Single car - EV assist", "Priya Shah", "1991-07-22", "+447700900103", "735921", "BS8 1TH", vehicle("veh-003-a", "BJ72 EVS", "Tesla", "Model 3", 2022, "White", "electric", "policy-electric-ev-003")),
            customer("cust-004", "Single car - premium European cover", "Oliver Bennett", "1983-02-09", "+447700900104", "904315", "EH3 6QH", vehicle("veh-004-a", "SC20 RDX", "BMW", "320i Touring", 2020, "Black", "petrol", "policy-european-premier-004")),
            customer("cust-005", "Single car - older vehicle", "Maya Thompson", "1994-09-14", "+447700900105", "158602", "CF10 1EP", vehicle("veh-005-a", "CY15 MTA", "Toyota", "Yaris", 2015, "Red", "hybrid", "policy-roadside-plus-001")),
            customer("cust-006", "Single car - basic cover edge cases", "Daniel Cooper", "1975-12-28", "+447700900106", "276948", "LS1 4AP", vehicle("veh-006-a", "YE19 DCP", "Nissan", "Qashqai", 2019, "Grey", "petrol", "policy-roadside-basic-002")),
            customer("cust-007", "Single car - EV safety escalation", "Sofia Martins", "1989-05-06", "+447700900107", "843650", "N1 8DU", vehicle("veh-007-a", "LN23 KWH", "Hyundai", "Kona Electric", 2023, "Green", "electric", "policy-electric-ev-003")),
            customer(
                "cust-008",
                "Two cars - choose vehicle",
                "Noah Williams",
                "1981-08-19",
                "+447700900108",
                "395174",
                "B15 2TT",
                vehicle("veh-008-a", "BK20 NWA", "Audi", "A4", 2020, "White", "diesel", "policy-roadside-plus-001"),
                vehicle("veh-008-b", "BK68 NWB", "Mini", "Cooper", 2018, "Yellow", "petrol", "policy-roadside-basic-002"),
            ),
            customer(
                "cust-009",
                "Two cars - petrol and EV",
                "Grace Wilson",
                "1996-01-31",
                "+447700900109",
                "520836",
                "G12 8QQ",
                vehicle("veh-009-a", "GL21 GWA", "Kia", "Sportage", 2021, "Blue", "petrol", "policy-roadside-plus-001"),
                vehicle("veh-009-b", "GL73 GWE", "Volkswagen", "ID.3", 2023, "White", "electric", "policy-electric-ev-003"),
            ),
            customer(
                "cust-010",
                "Three cars - household policy",
                "Ethan Clarke",
                "1972-10-11",
                "+447700900110",
                "667219",
                "OX2 6GG",
                vehicle("veh-010-a", "OX19 ECA", "Mercedes-Benz", "C-Class", 2019, "Black", "diesel", "policy-european-premier-004"),
                vehicle("veh-010-b", "OX17 ECB", "Honda", "Jazz", 2017, "Red", "petrol", "policy-roadside-basic-002"),
                vehicle("veh-010-c", "OX24 EVC", "Polestar", "2", 2024, "Grey", "electric", "policy-electric-ev-003"),
            ),
            customer(
                "cust-011",
                "Unknown-number verification demo",
                "Alex Carter",
                "1988-02-19",
                "+447700900111",
                "5482",
                "SW17 0BW",
                vehicle("veh-011-a", "LX20 ACT", "Vauxhall", "Astra", 2020, "Blue", "petrol", "policy-roadside-plus-001"),
            ),
        )

    val scenarios: List<Scenario> =
        listOf(
            Scenario("scenario-flat-tyre-safe", "Flat tyre, safe roadside", "I have a flat tyre on a quiet residential street. I am parked safely and nobody is injured.", "flat_tire", "I am in the Beaconsfield Services car park, just off the M40.", "I am safely off the road and there are no passengers at risk.", "covered_repair_truck", listOf("petrol", "diesel", "hybrid")),
            Scenario("scenario-motorway-engine-failure", "Engine failure on motorway shoulder", "The engine cut out on the motorway and I have stopped on the hard shoulder.", "engine_failure", "I am on the M4 westbound at Reading Services, near the services exit.", "I am behind the barrier now, but the car is on the hard shoulder.", "covered_tow_and_taxi", listOf("petrol", "diesel", "hybrid")),
            Scenario("scenario-dead-battery", "Dead battery near home", "The car will not start and I think the battery is dead.", "dead_battery", "I am by Leeds Civic Hall, on Calverley Street near Millennium Square.", "I am safe and the car is parked.", "covered_repair_truck", listOf("petrol", "diesel", "hybrid")),
            Scenario("scenario-ev-warning", "EV warning light", "My electric car has a red battery warning and reduced power.", "ev_warning", "I am in the Cabot Circus car park near the Newfoundland Street entrance.", "I am safe, there is no smoke, and the warning light is red.", "human_review_ev_tow", listOf("electric")),
            Scenario("scenario-possible-injury", "Collision with possible injury", "There has been a collision and one passenger may be injured.", "accident_with_injury", "I am by Parker's Piece, near the Gonville Place junction in Cambridge.", "One passenger says their neck hurts.", "safety_escalation_cancelled", listOf("petrol", "diesel", "hybrid", "electric")),
            Scenario("scenario-non-policyholder", "Passenger calling for policyholder", "I am a passenger calling on behalf of the policyholder. They are shaken up and asked me to call.", "third_party_caller", "We are at Peartree Park and Ride, just off the A34 near Oxford.", "We are safe and away from traffic.", "needs_human_callback", listOf("petrol", "diesel", "hybrid", "electric")),
        )

    private fun customer(
        id: String,
        demoLabel: String,
        name: String,
        birthDate: String,
        phoneNumber: String,
        roadsidePin: String,
        homePostcode: String,
        vararg vehicles: Vehicle,
    ) = Customer(
        id = id,
        demoLabel = demoLabel,
        name = name,
        birthDate = birthDate,
        phoneNumber = phoneNumber,
        roadsidePin = roadsidePin,
        homePostcode = homePostcode,
        preferredContact = "sms",
        vehicles = vehicles.toList(),
    )

    private fun vehicle(
        id: String,
        registration: String,
        make: String,
        model: String,
        year: Int,
        colour: String,
        fuelType: String,
        policyId: String,
    ) = Vehicle(id, registration, make, model, year, colour, fuelType, policyId)
}
