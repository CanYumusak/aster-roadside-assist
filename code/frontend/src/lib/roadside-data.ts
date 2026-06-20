export type Vehicle = {
  id?: string;
  policyId?: string;
  policyName?: string;
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
  action: "Tow truck" | "Repair truck" | "Taxi / rental" | "Human review" | "Security exit";
  provider: string;
  etaMinutes: number;
  coverage: "Covered" | "Covered with excess" | "Not covered" | "Human review required" | "Security exit";
  customerExplanation: string;
  severity: "low" | "medium" | "high";
};

export const SCENARIOS: Scenario[] = [
  {
    id: "flat-tyre",
    title: "Flat tyre, safe roadside",
    incidentPhrase: "I've got a flat tyre, front passenger side.",
    safetyPhrase: "I'm pulled into a layby, hazards on, everyone's fine.",
    locationPhrase: "Beaconsfield Services, Windsor Road, Beaconsfield HP9 2SE.",
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
    locationPhrase: "Reading Services Westbound, M4, Reading RG30 3UQ.",
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
    locationPhrase: "Leeds Civic Hall, Calverley Street, Leeds LS1 1UR.",
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
    locationPhrase: "The Oracle Riverside Car Park, Reading RG1 2AG.",
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
    locationPhrase: "Parker's Piece, Gonville Place, Cambridge CB1 1NA.",
    action: "Security exit",
    provider: "No dispatch",
    etaMinutes: 0,
    coverage: "Security exit",
    customerExplanation:
      "If anyone may be injured or in immediate danger, call emergency services now. Move to a safe place if you can. We cannot continue roadside intake until everyone is safe.",
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
    suggestedLocation: "Beaconsfield Services, Windsor Road, Beaconsfield HP9 2SE.",
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
    suggestedLocation: "Reading Services Westbound, M4, Reading RG30 3UQ.",
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
    suggestedLocation: "Leeds Civic Hall, Calverley Street, Leeds LS1 1UR.",
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
    suggestedLocation: "The Oracle Riverside Car Park, Reading RG1 2AG.",
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
    suggestedLocation: "Cabot Circus car park, Newfoundland Street, Bristol BS2 9AB.",
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
    suggestedLocation: "Asda Stevenage Supercentre, Monkswood Way, Stevenage SG1 1LA.",
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
    suggestedLocation: "Leeds Civic Hall, Calverley Street, Leeds LS1 1UR.",
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
    suggestedLocation: "Parker's Piece, Gonville Place, Cambridge CB1 1NA.",
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
    suggestedLocation: "Stafford Services Northbound, M6, Stone ST15 0XE.",
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
    suggestedLocation: "Brighton Palace Pier, Madeira Drive, Brighton BN2 1TW.",
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
  | "Escalated"
  | "SecurityExit";
