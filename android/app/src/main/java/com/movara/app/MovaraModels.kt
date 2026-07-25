package com.movara.app

data class Vehicle(
    val id: String,
    val name: String,
    val licensePlate: String?,
    val odometer: Double?,
    val isLocal: Boolean = false
)

data class Device(
    val id: String,
    val imei: String,
    val name: String?,
    val status: String,
    val protocol: String,
    val lastSeen: String?,
    val lastAttributes: Map<String, String> = emptyMap(),
    val packetAttributes: List<DevicePacketSnapshot> = emptyList()
)

data class DevicePacketSnapshot(
    val packetId: String,
    val updatedAt: String,
    val attributes: Map<String, String>
)

data class Trip(
    val id: String,
    val vehicleId: String?,
    val deviceId: String?,
    val label: String,
    val vehicleName: String?,
    val deviceName: String?,
    val startTime: String,
    val endTime: String,
    val favorite: Boolean,
    val source: String
)

data class DeviceCommandField(
    val key: String,
    val label: String,
    val type: String,
    val required: Boolean,
    val placeholder: String?,
    val helpText: String?,
    val options: List<String>,
)

data class DeviceCommandDefinition(
    val key: String,
    val label: String,
    val description: String?,
    val category: String?,
    val fields: List<DeviceCommandField>,
)

data class DeviceCommandRecord(
    val id: String,
    val commandLabel: String,
    val content: String?,
    val status: String,
    val createdAt: String?,
    val response: String?,
    val error: String?,
)

data class DeviceCommandPanel(
    val supportsCommands: Boolean,
    val connected: Boolean,
    val commands: List<DeviceCommandDefinition>,
    val history: List<DeviceCommandRecord>,
)

data class TripStats(
    val odometerKm: Double,
    val maxSpeedKmh: Double,
    val avgSpeedKmh: Double,
    val pointCount: Int
)

data class TripStop(
    val label: String,
    val startTime: String,
    val endTime: String?,
    val latitude: Double,
    val longitude: Double,
    val source: String = "manual"
)

data class TripDetail(
    val trip: Trip,
    val positions: List<Position>,
    val stats: TripStats?,
    val stops: List<TripStop>,
    val fuelStops: List<FuelRecord> = emptyList()
)

data class VehicleRecord(
    val id: String,
    val vehicleId: String,
    val vehicleName: String?,
    val type: String,
    val subtype: String?,
    val title: String,
    val date: String,
    val amount: Double?,
    val odometer: Double?,
    val notes: String?,
    val validFrom: String? = null,
    val validUntil: String? = null,
    val provider: String? = null,
    val referenceNumber: String? = null,
    val reminderMode: String = "none",
    val reminderDaysBefore: Int? = null,
    val recurringIntervalDays: Int? = null,
    val recurringIntervalKm: Int? = null,
    val attachmentPath: String? = null,
)

data class FuelRecord(
    val id: String,
    val vehicleId: String,
    val vehicleName: String?,
    val date: String,
    val odometer: Double,
    val fuelQuantity: Double,
    val fuelCost: Double?,
    val fuelRate: Double?,
    val latitude: Double?,
    val longitude: Double?
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

data class DraftVehicle(
    val localId: String,
    val name: String,
    val licensePlate: String?,
    val odometer: Double?,
    val createdAt: Long,
    val lastError: String?
)

data class SyncResult(
    val attempted: Int,
    val synced: Int,
    val failed: Int
)
