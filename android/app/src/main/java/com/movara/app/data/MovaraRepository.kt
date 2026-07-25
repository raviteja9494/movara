package com.movara.app.data

import com.movara.app.Device
import com.movara.app.DevicePacketSnapshot
import com.movara.app.DraftRecord
import com.movara.app.FuelRecord
import com.movara.app.Position
import com.movara.app.QueuedPosition
import com.movara.app.SyncResult
import com.movara.app.Trip
import com.movara.app.TripDetail
import com.movara.app.TripStats
import com.movara.app.TripStop
import com.movara.app.Vehicle
import com.movara.app.VehicleRecord
import com.movara.app.data.local.DraftRecordEntity
import com.movara.app.data.local.MovaraDao
import com.movara.app.data.local.QueuedPositionEntity
import com.movara.app.data.local.VehicleEntity
import com.movara.app.data.local.toDomain
import com.movara.app.data.network.CreateFuelRecordRequest
import com.movara.app.data.network.CreateTripRequest
import com.movara.app.data.network.CreateVehicleRecordRequest
import com.movara.app.data.network.CreateVehicleRequest
import com.movara.app.data.network.DeviceDto
import com.movara.app.data.network.FuelRecordDto
import com.movara.app.data.network.LoginRequest
import com.movara.app.data.network.MovaraApiService
import com.movara.app.data.network.PositionDto
import com.movara.app.data.network.TrackerStateRequest
import com.movara.app.data.network.TripDto
import com.movara.app.data.network.UpdateFavoriteRequest
import com.movara.app.data.network.VehicleDto
import com.movara.app.data.network.VehicleRecordDto
import com.movara.app.data.settings.AppSettings
import com.movara.app.data.settings.SettingsRepository
import com.movara.app.di.IoDispatcher
import com.movara.app.di.PlainHttpClient
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

data class RefreshSnapshot(
    val devices: List<Device>,
    val trips: List<Trip>,
    val records: List<VehicleRecord>,
    val fuelRecords: List<FuelRecord>,
)

data class SyncSummary(
    val vehicles: SyncResult,
    val records: SyncResult,
    val positions: SyncResult,
) {
    val attempted: Int get() = vehicles.attempted + records.attempted + positions.attempted
    val synced: Int get() = vehicles.synced + records.synced + positions.synced
    val failed: Int get() = vehicles.failed + records.failed + positions.failed
}

data class RecordDraftInput(
    val vehicle: Vehicle,
    val fuel: Boolean,
    val type: String,
    val subtype: String,
    val title: String,
    val date: String,
    val odometer: Double?,
    val amount: Double?,
    val fuelQuantity: Double?,
    val notes: String?,
)

@Singleton
class MovaraRepository @Inject constructor(
    private val api: MovaraApiService,
    private val dao: MovaraDao,
    val settingsRepository: SettingsRepository,
    @PlainHttpClient private val plainClient: OkHttpClient,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) {
    val vehicles: Flow<List<Vehicle>> = dao.observeVehicles().map { items -> items.map { it.toDomain() } }
    val drafts: Flow<List<DraftRecord>> = dao.observeDrafts().map { items -> items.map { it.toDomain() } }
    val queuedPositionCount: Flow<Int> = dao.observeQueuedPositionCount()
    val settings: Flow<AppSettings> = settingsRepository.settings

    suspend fun saveServer(url: String) = settingsRepository.saveServer(url)
    suspend fun saveTracking(deviceId: String, endpoint: String, interval: Int, distance: Int) =
        settingsRepository.saveTracking(deviceId, endpoint, interval, distance)

    suspend fun logout() = settingsRepository.clearSession()

    suspend fun login(email: String, password: String): RefreshSnapshot = withContext(ioDispatcher) {
        settingsRepository.clearSession()
        val response = api.login(LoginRequest(email.trim(), password))
        settingsRepository.saveSession(email, response.token)
        syncPending()
        refresh()
    }

    suspend fun refresh(): RefreshSnapshot = withContext(ioDispatcher) {
        coroutineScope {
            val remoteVehicles = api.vehicles().data.map { it.toDomain() }
            dao.replaceRemoteVehicles(remoteVehicles.map { it.toEntity() })
            val devices = async { api.devices().data.map { it.toDomain() } }
            val trips = async { fetchTrips() }
            val records = async { fetchVehicleRecords() }
            val fuel = async {
                remoteVehicles.map { vehicle ->
                    async {
                        api.fuelRecords(vehicle.id).fuelRecords.map { it.toDomain(vehicle) }
                    }
                }.awaitAll().flatten().sortedByDescending { it.date }
            }
            RefreshSnapshot(devices.await(), trips.await(), records.await(), fuel.await())
        }
    }

    suspend fun addVehicle(name: String, plate: String?, odometer: Double?): Vehicle = withContext(ioDispatcher) {
        val vehicle = Vehicle(
            id = "local-${System.currentTimeMillis()}",
            name = name.trim(),
            licensePlate = plate?.trim()?.ifBlank { null },
            odometer = odometer,
            isLocal = true,
        )
        dao.upsertVehicle(vehicle.toEntity())
        vehicle
    }

    suspend fun addDraft(input: RecordDraftInput): Long = withContext(ioDispatcher) {
        dao.insertDraft(
            DraftRecordEntity(
                syncKind = if (input.fuel) "fuel" else "vehicle_record",
                vehicleId = input.vehicle.id,
                vehicleName = input.vehicle.name,
                type = if (input.fuel) "expense" else input.type,
                subtype = if (input.fuel) "custom" else input.subtype,
                title = input.title.trim().ifBlank { if (input.fuel) "Fuel fill-up" else "Vehicle record" },
                date = input.date,
                odometer = input.odometer,
                amount = input.amount,
                fuelQuantity = input.fuelQuantity,
                notes = input.notes?.trim()?.ifBlank { null },
                createdAt = System.currentTimeMillis(),
                lastError = null,
            )
        )
    }

    suspend fun deleteDraft(id: Long) = withContext(ioDispatcher) { dao.deleteDraft(id) }

    suspend fun enqueuePosition(
        deviceLabel: String,
        timestamp: String,
        latitude: Double,
        longitude: Double,
        speed: Double?,
        accuracy: Double?,
    ) = withContext(ioDispatcher) {
        dao.insertQueuedPosition(
            QueuedPositionEntity(
                deviceLabel = deviceLabel,
                timestamp = timestamp,
                latitude = latitude,
                longitude = longitude,
                speed = speed,
                accuracy = accuracy,
                createdAt = System.currentTimeMillis(),
                lastError = null,
            )
        )
    }

    suspend fun syncPending(): SyncSummary = withContext(ioDispatcher) {
        val vehicleResult = syncVehicles()
        val recordResult = syncRecords()
        val positionResult = flushPositions()
        SyncSummary(vehicleResult, recordResult, positionResult)
    }

    suspend fun flushPositions(): SyncResult = withContext(ioDispatcher) {
        val queued = dao.queuedPositions()
        var synced = 0
        var failed = 0
        queued.forEach { entity ->
            try {
                uploadOsmAndPosition(entity.toDomain())
                dao.deleteQueuedPosition(entity.id)
                synced++
            } catch (error: Exception) {
                dao.markQueuedPositionError(entity.id, error.message.orEmpty().take(300))
                failed++
            }
        }
        SyncResult(queued.size, synced, failed)
    }

    suspend fun tripDetail(id: String): TripDetail = withContext(ioDispatcher) {
        val response = api.trip(id)
        val positions = response.positions.map { it.toDomain() }
        TripDetail(
            trip = response.trip.toDomain(),
            positions = positions,
            stats = response.stats?.let {
                TripStats(
                    odometerKm = it.odometerKm ?: 0.0,
                    maxSpeedKmh = it.maxSpeedKmh ?: 0.0,
                    avgSpeedKmh = it.avgSpeedKmh ?: 0.0,
                    pointCount = it.pointCount ?: positions.size,
                )
            },
            stops = response.stops.map {
                TripStop(
                    label = it.label ?: "Stop",
                    startTime = it.startTime.orEmpty(),
                    endTime = it.endTime,
                    latitude = it.latitude,
                    longitude = it.longitude,
                )
            },
        )
    }

    suspend fun devicePositions(deviceId: String, hours: Int): List<Position> = withContext(ioDispatcher) {
        val from = Instant.now().minusSeconds(hours.coerceAtLeast(1) * 3600L).toString()
        api.positions(deviceId, limit = 1000, from = from).positions.map { it.toDomain() }
    }

    suspend fun toggleFavorite(trip: Trip): Trip = withContext(ioDispatcher) {
        api.updateTrip(trip.id, UpdateFavoriteRequest(!trip.favorite))
        trip.copy(favorite = !trip.favorite)
    }

    suspend fun createTrip(
        deviceId: String,
        vehicleId: String?,
        name: String?,
        start: String,
        end: String,
        favorite: Boolean,
    ): Trip = withContext(ioDispatcher) {
        api.createTrip(
            CreateTripRequest(
                deviceId = deviceId,
                vehicleId = vehicleId?.takeIf(String::isNotBlank),
                name = name?.trim()?.ifBlank { null },
                startTime = start,
                endTime = end,
                favorite = favorite,
            )
        ).trip.toDomain()
    }

    suspend fun updateTrackerState(active: Boolean): Device? = withContext(ioDispatcher) {
        val settings = settingsRepository.current()
        settingsRepository.setTrackerActive(active)
        val label = settings.trackingDeviceId.ifBlank { android.os.Build.MODEL ?: "phone" }
        val osmand = runCatching { uploadOsmAndTrackerState(label, active) }
        if (!settings.isLoggedIn) {
            osmand.getOrThrow()
            null
        } else {
            runCatching {
                api.updateTrackerState(TrackerStateRequest(label, active)).device?.toDomain()
            }.getOrElse {
                osmand.getOrThrow()
                null
            }
        }
    }

    private suspend fun syncVehicles(): SyncResult {
        val pending = dao.pendingVehicles()
        var synced = 0
        var failed = 0
        pending.forEach { local ->
            try {
                val remote = api.createVehicle(
                    CreateVehicleRequest(local.name, local.licensePlate, local.odometer)
                ).vehicle.toDomain()
                dao.replacePendingVehicle(local.id, remote.toEntity())
                synced++
            } catch (_: Exception) {
                failed++
            }
        }
        return SyncResult(pending.size, synced, failed)
    }

    private suspend fun syncRecords(): SyncResult {
        val pending = dao.pendingRecords()
        var synced = 0
        var failed = 0
        pending.forEach { draft ->
            try {
                if (draft.syncKind == "fuel") {
                    api.createFuelRecord(
                        draft.vehicleId,
                        CreateFuelRecordRequest(
                            date = draft.date,
                            odometer = draft.odometer?.toLong() ?: 0,
                            fuelQuantity = draft.fuelQuantity ?: 0.0,
                            fuelCost = draft.amount,
                        )
                    )
                } else {
                    api.createVehicleRecord(
                        CreateVehicleRecordRequest(
                            vehicleId = draft.vehicleId,
                            type = draft.type,
                            subtype = draft.subtype,
                            title = draft.title,
                            date = draft.date,
                            notes = draft.notes,
                            odometer = draft.odometer?.toLong(),
                            amount = draft.amount,
                        )
                    )
                }
                dao.deleteDraft(draft.id)
                synced++
            } catch (error: Exception) {
                dao.markDraftError(draft.id, error.message.orEmpty().take(300))
                failed++
            }
        }
        return SyncResult(pending.size, synced, failed)
    }

    private suspend fun fetchTrips(): List<Trip> {
        val result = mutableListOf<Trip>()
        var page = 1
        do {
            val response = api.trips(page = page)
            result += response.data.map { it.toDomain() }
            page++
        } while (response.pagination?.hasNextPage == true && page <= 20)
        return result
    }

    private suspend fun fetchVehicleRecords(): List<VehicleRecord> {
        val result = mutableListOf<VehicleRecord>()
        var page = 1
        do {
            val response = api.vehicleRecords(page = page)
            result += response.data.map { it.toDomain() }
            page++
        } while (response.pagination?.hasNextPage == true && page <= 20)
        return result.sortedByDescending { it.date }
    }

    private suspend fun uploadOsmAndPosition(position: QueuedPosition) {
        val settings = settingsRepository.current()
        val id = settings.trackingDeviceId.ifBlank { position.deviceLabel }
        val url = settings.osmandEndpointUrl().toHttpUrl().newBuilder()
            .addQueryParameter("id", id)
            .addQueryParameter("lat", position.latitude.toString())
            .addQueryParameter("lon", position.longitude.toString())
            .addQueryParameter("timestamp", position.timestamp)
            .addQueryParameter("speed", (position.speed ?: 0.0).toString())
            .addQueryParameter("accuracy", (position.accuracy ?: 0.0).toString())
            .addQueryParameter("source", "movara_android")
            .addQueryParameter("trackerActive", settings.trackerActive.toString())
            .build()
        plainClient.newCall(Request.Builder().url(url).get().build()).execute().use { response ->
            check(response.isSuccessful) { "OsmAnd upload returned HTTP ${response.code}." }
        }
    }

    private suspend fun uploadOsmAndTrackerState(label: String, active: Boolean) {
        val settings = settingsRepository.current()
        val url = settings.osmandEndpointUrl().toHttpUrl().newBuilder()
            .addQueryParameter("id", label)
            .addQueryParameter("source", "movara_android")
            .addQueryParameter("trackerActive", active.toString())
            .build()
        plainClient.newCall(Request.Builder().url(url).get().build()).execute().use { response ->
            check(response.isSuccessful) { "OsmAnd state update returned HTTP ${response.code}." }
        }
    }
}

private fun Vehicle.toEntity() = VehicleEntity(
    id = id,
    name = name,
    licensePlate = licensePlate,
    odometer = odometer,
    pendingCreate = isLocal,
    createdAt = System.currentTimeMillis(),
)

private fun VehicleDto.toDomain() = Vehicle(
    id = id,
    name = name ?: "Vehicle",
    licensePlate = licensePlate,
    odometer = currentOdometer ?: estimatedOdometerKm,
)

private fun DeviceDto.toDomain() = Device(
    id = id,
    imei = imei.orEmpty(),
    name = name,
    status = status ?: "unknown",
    protocol = protocol ?: "unknown",
    lastSeen = lastSeen,
    lastAttributes = lastAttributes.toStringMap(),
    packetAttributes = packetAttributes.orEmpty().map {
        DevicePacketSnapshot(
            packetId = it.packetId.orEmpty(),
            updatedAt = it.updatedAt.orEmpty(),
            attributes = it.attributes.toStringMap(),
        )
    },
)

private fun TripDto.toDomain() = Trip(
    id = id,
    vehicleId = vehicleId,
    label = name ?: vehicle?.name ?: "Trip",
    vehicleName = vehicle?.name,
    deviceName = device?.name ?: device?.imei,
    startTime = startTime.orEmpty(),
    endTime = endTime.orEmpty(),
    favorite = favorite ?: false,
    source = source ?: "device",
)

private fun PositionDto.toDomain() = Position(latitude, longitude, timestamp.orEmpty(), speed)

private fun VehicleRecordDto.toDomain() = VehicleRecord(
    id = id,
    vehicleId = vehicleId,
    vehicleName = vehicleName,
    type = type ?: "record",
    subtype = subtype,
    title = title ?: "Record",
    date = date.orEmpty(),
    amount = amount,
    odometer = odometer,
    notes = notes,
)

private fun FuelRecordDto.toDomain(vehicle: Vehicle) = FuelRecord(
    id = id,
    vehicleId = vehicle.id,
    vehicleName = vehicle.name,
    date = date.orEmpty(),
    odometer = odometer ?: 0.0,
    fuelQuantity = fuelQuantity ?: 0.0,
    fuelCost = fuelCost,
    fuelRate = fuelRate,
    latitude = latitude,
    longitude = longitude,
)

private fun Map<String, Any?>?.toStringMap(): Map<String, String> =
    orEmpty().mapValues { (_, value) -> value?.toString().orEmpty() }
