package com.movara.app.presentation.screens

import com.movara.app.Trip

internal fun tripListTitle(trip: Trip): String = trip.name?.takeIf(String::isNotBlank) ?: trip.id.take(8)

internal fun tripDetailTitle(trip: Trip): String = trip.name?.takeIf(String::isNotBlank)
    ?: "${trip.vehicleName ?: "Trip"} · ${trip.startTime.replace('T', ' ').take(16)}"

internal fun tripSourceLabel(trip: Trip): String = when (trip.source) {
    "imported" -> "GPX"
    "auto-ignition-active" -> "Automatic trip · active"
    "auto-ignition" -> "Automatic trip"
    "device" -> trip.deviceName ?: "Device"
    "manual" -> "Manual trip"
    else -> trip.source.replace('-', ' ').replaceFirstChar(Char::uppercase)
}
