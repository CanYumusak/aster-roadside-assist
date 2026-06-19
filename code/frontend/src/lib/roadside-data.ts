export type Vehicle = {
  id?: string;
  policyId?: string;
  reg: string;
  make: string;
  model: string;
  year: number;
  fuel: "Petrol" | "Diesel" | "Hybrid" | "EV";
};

export type Customer = {
  id: string;
  name: string;
  birthdate: string;
  phone: string;
  pin: string;
  pinDigitsAsked: number[]; // 1-indexed digit positions
  tier: "Essential" | "Plus" | "Premier";
  vehicles: Vehicle[];
  suggestedScenarioId: string;
  suggestedLocation: string;
  suggestedSafety: string;
};

export type Scenario = {
  id: string;
  title: string;
  incidentPhrase: string;
  safetyPhrase: string;
  locationPhrase: string;
  action: "Tow truck" | "Repair truck" | "Taxi / rental" | "Human review";
  provider: string;
  etaMinutes: number;
  coverage: "Covered" | "Covered with excess" | "Human review required";
  customerExplanation: string;
  severity: "low" | "medium" | "high";
};

export const SCENARIOS: Scenario[] = [
  {
    id: "flat-tyre",
    title: "Flat tyre, safe roadside",
    incidentPhrase: "I've got a flat tyre, front passenger side.",
    safetyPhrase: "I'm pulled into a layby, hazards on, everyone's fine.",
    locationPhrase: "A roadside layby on the A40 just past the Beaconsfield turn-off.",
    action: "Repair truck",
    provider: "Westline Tyre & Recovery",
    etaMinutes: 38,
    coverage: "Covered",
    customerExplanation:
      "Your Plus cover includes roadside tyre repair. A technician is on the way.",
    severity: "low",
  },
  {
    id: "engine-motorway",
    title: "Engine failure on motorway shoulder",
    incidentPhrase: "The engine cut out, lots of warning lights, I coasted onto the hard shoulder.",
    safetyPhrase: "I'm out of the car, behind the barrier, hazards on.",
    locationPhrase: "M25 clockwise, between junction 16 and 17, near a blue marker.",
    action: "Tow truck",
    provider: "National Highway Recovery",
    etaMinutes: 52,
    coverage: "Covered",
    customerExplanation:
      "We're dispatching a recovery truck. Please stay behind the barrier until they arrive.",
    severity: "high",
  },
  {
    id: "dead-battery",
    title: "Dead battery near home",
    incidentPhrase: "Car won't start, just clicks. Battery I think.",
    safetyPhrase: "I'm on my driveway, no danger.",
    locationPhrase: "Home address on file, on the driveway.",
    action: "Repair truck",
    provider: "Aster Home Assist",
    etaMinutes: 65,
    coverage: "Covered",
    customerExplanation:
      "A technician will attend at your home address to jump-start or replace the battery.",
    severity: "low",
  },
  {
    id: "ev-warning",
    title: "EV warning light",
    incidentPhrase: "Battery warning is on, range dropped fast, car is in limp mode.",
    safetyPhrase: "I've stopped in a supermarket car park.",
    locationPhrase: "Sainsbury's car park in Reading town centre.",
    action: "Tow truck",
    provider: "Voltline EV Recovery",
    etaMinutes: 47,
    coverage: "Covered with excess",
    customerExplanation:
      "EV recovery is included. We're sending a flatbed authorised for high-voltage vehicles.",
    severity: "medium",
  },
  {
    id: "collision-injury",
    title: "Collision with possible injury",
    incidentPhrase: "Another car hit me at a junction, my passenger's neck hurts.",
    safetyPhrase: "We're out of the road but my passenger is in pain.",
    locationPhrase: "Junction of King Street and Mill Road in Cambridge.",
    action: "Human review",
    provider: "Aster Major Incident Team",
    etaMinutes: 12,
    coverage: "Human review required",
    customerExplanation:
      "I'm connecting you to a human handler now. Please stay on the line, help is being arranged.",
    severity: "high",
  },
];

export const CUSTOMERS: Customer[] = [
  {
    id: "c1",
    name: "Helena Park",
    birthdate: "1986-03-14",
    phone: "+44 7700 900181",
    pin: "4729",
    pinDigitsAsked: [1, 3],
    tier: "Plus",
    vehicles: [{ reg: "LR21 KJD", make: "Volkswagen", model: "Golf", year: 2021, fuel: "Petrol" }],
    suggestedScenarioId: "flat-tyre",
    suggestedLocation: "A roadside layby on the A40 just past the Beaconsfield turn-off.",
    suggestedSafety: "Pulled in, hazards on, everyone safe.",
  },
  {
    id: "c2",
    name: "Marcus Aldridge",
    birthdate: "1972-11-02",
    phone: "+44 7700 900233",
    pin: "8156",
    pinDigitsAsked: [2, 4],
    tier: "Premier",
    vehicles: [
      { reg: "BV70 XRT", make: "BMW", model: "5 Series", year: 2020, fuel: "Diesel" },
      { reg: "GH22 PLM", make: "Mini", model: "Cooper", year: 2022, fuel: "Petrol" },
    ],
    suggestedScenarioId: "engine-motorway",
    suggestedLocation: "M25 clockwise, between J16 and J17.",
    suggestedSafety: "Behind the barrier, hazards on.",
  },
  {
    id: "c3",
    name: "Priya Shankar",
    birthdate: "1994-07-21",
    phone: "+44 7700 900342",
    pin: "3041",
    pinDigitsAsked: [1, 4],
    tier: "Essential",
    vehicles: [{ reg: "EA19 ZTM", make: "Ford", model: "Fiesta", year: 2019, fuel: "Petrol" }],
    suggestedScenarioId: "dead-battery",
    suggestedLocation: "Home address on file.",
    suggestedSafety: "On the driveway, no danger.",
  },
  {
    id: "c4",
    name: "Owen Whitfield",
    birthdate: "1965-01-09",
    phone: "+44 7700 900455",
    pin: "9920",
    pinDigitsAsked: [2, 3],
    tier: "Premier",
    vehicles: [
      { reg: "JT23 EVQ", make: "Tesla", model: "Model 3", year: 2023, fuel: "EV" },
      { reg: "KP18 RWE", make: "Land Rover", model: "Discovery", year: 2018, fuel: "Diesel" },
      { reg: "NB21 OAS", make: "Audi", model: "A4", year: 2021, fuel: "Hybrid" },
    ],
    suggestedScenarioId: "ev-warning",
    suggestedLocation: "Sainsbury's car park, Reading.",
    suggestedSafety: "Parked safely, out of traffic.",
  },
  {
    id: "c5",
    name: "Lena Hofmann",
    birthdate: "1990-05-30",
    phone: "+44 7700 900512",
    pin: "1764",
    pinDigitsAsked: [1, 2],
    tier: "Plus",
    vehicles: [{ reg: "SY20 HBN", make: "Renault", model: "Zoe", year: 2020, fuel: "EV" }],
    suggestedScenarioId: "ev-warning",
    suggestedLocation: "Bristol Cabot Circus car park.",
    suggestedSafety: "Parked, hazards on.",
  },
  {
    id: "c6",
    name: "Daniel Otieno",
    birthdate: "1981-08-17",
    phone: "+44 7700 900627",
    pin: "6582",
    pinDigitsAsked: [3, 4],
    tier: "Essential",
    vehicles: [{ reg: "MA17 GLP", make: "Vauxhall", model: "Astra", year: 2017, fuel: "Petrol" }],
    suggestedScenarioId: "flat-tyre",
    suggestedLocation: "Layby on the A1, near Stevenage.",
    suggestedSafety: "Pulled off, hazards on.",
  },
  {
    id: "c7",
    name: "Sofia Marchetti",
    birthdate: "1998-12-04",
    phone: "+44 7700 900748",
    pin: "2317",
    pinDigitsAsked: [2, 4],
    tier: "Plus",
    vehicles: [
      { reg: "OR22 FTA", make: "Toyota", model: "Yaris", year: 2022, fuel: "Hybrid" },
      { reg: "EJ19 VND", make: "Honda", model: "Civic", year: 2019, fuel: "Petrol" },
    ],
    suggestedScenarioId: "dead-battery",
    suggestedLocation: "Outside her flat in Leeds.",
    suggestedSafety: "Parked on the street, no danger.",
  },
  {
    id: "c8",
    name: "Rashid Bennett",
    birthdate: "1977-09-25",
    phone: "+44 7700 900819",
    pin: "5093",
    pinDigitsAsked: [1, 3],
    tier: "Premier",
    vehicles: [{ reg: "BD24 KPL", make: "Mercedes", model: "E-Class", year: 2024, fuel: "Hybrid" }],
    suggestedScenarioId: "collision-injury",
    suggestedLocation: "Junction of King Street and Mill Road, Cambridge.",
    suggestedSafety: "Out of the road, but a passenger is hurt.",
  },
  {
    id: "c9",
    name: "Aoife Donnelly",
    birthdate: "1989-04-12",
    phone: "+44 7700 900906",
    pin: "8431",
    pinDigitsAsked: [2, 3],
    tier: "Plus",
    vehicles: [{ reg: "WF21 ARM", make: "Skoda", model: "Octavia", year: 2021, fuel: "Diesel" }],
    suggestedScenarioId: "engine-motorway",
    suggestedLocation: "M6 northbound, near Stafford.",
    suggestedSafety: "Hard shoulder, behind the barrier.",
  },
  {
    id: "c10",
    name: "Jonas Reyes",
    birthdate: "1959-06-08",
    phone: "+44 7700 900974",
    pin: "7268",
    pinDigitsAsked: [1, 4],
    tier: "Essential",
    vehicles: [{ reg: "PR16 CTY", make: "Citroën", model: "C3", year: 2016, fuel: "Petrol" }],
    suggestedScenarioId: "flat-tyre",
    suggestedLocation: "Side street in Brighton, near the seafront.",
    suggestedSafety: "Parked, no danger.",
  },
];

export const UNKNOWN_DEMO_PHONE = "+44 7700 900000";

export const STAGES = [
  "Lookup",
  "Safety",
  "Verify",
  "Vehicle",
  "Location",
  "Incident",
  "Coverage",
  "Action",
  "SMS",
] as const;

export type Stage = (typeof STAGES)[number];

export type CallState =
  | "Ready"
  | "Ringing"
  | "Listening"
  | "Thinking"
  | "Speaking"
  | "Completed"
  | "Escalated";
