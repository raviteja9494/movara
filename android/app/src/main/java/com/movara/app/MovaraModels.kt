package com.movara.app

data class Vehicle(
    val id: String,
    val name: String,
    val licensePlate: String?,
    val odometer: Double?
)

data class Device(
    val id: String,
    val imei: String,
    val name: String?,
    val status: String,
    val protocol: String,
    val lastSeen: String?
)

data class Trip(
    val id: String,
    val label: String,
    val vehicleName: String?,
    val deviceName: String?,
    val startTime: String,
    val endTime: String,
    val favorite: Boolean,
    val source: String
)

data class Position(
    val latitude: Double,
    val longitude: Double,
    val timestamp: String,
    val speed: Double?
)

data class QueuedPosition(
    val id: Long,
    val deviceLabel: String,
    val timestamp: String,
    val latitude: Double,
    val longitude: Double,
    val speed: Double?,
    val accuracy: Double?,
    val createdAt: Long,
    val lastError: String?
)

data class DraftRecord(
    val id: Long,
    val syncKind: String,
    val vehicleId: String,
    val vehicleName: String,
    val type: String,
    val subtype: String,
    val title: String,
    val date: String,
    val odometer: Double?,
    val amount: Double?,
    val fuelQuantity: Double?,
    val notes: String?,
    val createdAt: Long,
    val lastError: String?
)

data class SyncResult(
    val attempted: Int,
    val synced: Int,
    val failed: Int
)
