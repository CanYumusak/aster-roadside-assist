package com.aster.roadside.ai;

public class IncidentClassificationOutput {
    public IncidentType incidentType;

    public enum IncidentType {
        NONE,
        FLAT_TIRE,
        DEAD_BATTERY,
        ENGINE_FAILURE,
        LOST_KEYS,
        FUEL_ISSUE,
        EV_WARNING,
        EV_BATTERY_DEPLETED,
        CHARGING_STATION_FAILURE,
        MINOR_MECHANICAL_FAULT,
        ACCIDENT_WITH_INJURY,
        THIRD_PARTY_CALLER
    }
}
