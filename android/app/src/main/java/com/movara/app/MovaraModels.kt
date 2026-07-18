package com.movara.app

data class Vehicle(
    val id: String,
    val name: String,
    val licensePlate: String?,
    val odometer: Double?
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
