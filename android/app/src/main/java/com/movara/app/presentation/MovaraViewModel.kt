package com.movara.app.presentation

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.movara.app.Device
import com.movara.app.DraftRecord
import com.movara.app.FuelRecord
import com.movara.app.Position
import com.movara.app.TrackingService
import com.movara.app.Trip
import com.movara.app.TripDetail
import com.movara.app.Vehicle
import com.movara.app.VehicleRecord
import com.movara.app.data.MovaraRepository
import com.movara.app.data.RecordDraftInput
import com.movara.app.data.RefreshSnapshot
import com.movara.app.data.settings.AppSettings
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import javax.inject.Inject

data class MovaraUiState(
    val settings: AppSettings = AppSettings(),
    val vehicles: List<Vehicle> = emptyList(),
    val drafts: List<DraftRecord> = emptyList(),
    val queuedPositions: Int = 0,
    val devices: List<Device> = emptyList(),
    val trips: List<Trip> = emptyList(),
    val records: List<VehicleRecord> = emptyList(),
    val fuelRecords: List<FuelRecord> = emptyList(),
    val tripDetails: Map<String, TripDetail> = emptyMap(),
    val devicePositions: Map<String, List<Position>> = emptyMap(),
    val busy: Boolean = false,
    val busyLabel: String = "",
    val message: String? = null,
) {
    val pendingCount: Int get() = vehicles.count(Vehicle::isLocal) + drafts.size + queuedPositions
}

@HiltViewModel
class MovaraViewModel @Inject constructor(
    private val repository: MovaraRepository,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private val _uiState = MutableStateFlow(MovaraUiState())
    val uiState: StateFlow<MovaraUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            combine(
                repository.settings,
                repository.vehicles,
                repository.drafts,
                repository.queuedPositionCount,
            ) { settings, vehicles, drafts, queued ->
                LocalState(settings, vehicles, drafts, queued)
            }.collect { local ->
                _uiState.update {
                    it.copy(
                        settings = local.settings,
                        vehicles = local.vehicles,
                        drafts = local.drafts,
                        queuedPositions = local.queued,
                    )
                }
            }
        }
        viewModelScope.launch {
            if (repository.settings.first().isLoggedIn) refresh()
        }
    }

    fun consumeMessage() = _uiState.update { it.copy(message = null) }

    fun saveServer(url: String) {
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            showMessage("Server URL must start with http:// or https://.")
            return
        }
        launchTask("Saving server") {
            repository.saveServer(url)
            showMessage("Server saved. Log in to refresh server data.")
        }
    }

    fun login(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            showMessage("Enter email and password.")
            return
        }
        launchTask("Connecting to Movara") {
            applySnapshot(repository.login(email, password))
            showMessage("Connected and synchronized.")
        }
    }

    fun connect(serverUrl: String, email: String, password: String) {
        if (!serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
            showMessage("Server URL must start with http:// or https://.")
            return
        }
        if (email.isBlank() || password.isBlank()) {
            showMessage("Enter email and password.")
            return
        }
        launchTask("Connecting to Movara") {
            repository.saveServer(serverUrl)
            applySnapshot(repository.login(email, password))
            showMessage("Connected and synchronized.")
        }
    }

    fun logout() = launchTask("Signing out") {
        repository.logout()
        _uiState.update {
            it.copy(
                devices = emptyList(),
                trips = emptyList(),
                records = emptyList(),
                fuelRecords = emptyList(),
                tripDetails = emptyMap(),
                devicePositions = emptyMap(),
            )
        }
        showMessage("Logged out. Local drafts remain on this phone.")
    }

    fun refresh() = launchTask("Refreshing fleet") {
        check(_uiState.value.settings.isLoggedIn) { "Log in before refreshing." }
        applySnapshot(repository.refresh())
        showMessage("Movara data refreshed.")
    }

    fun syncAll() = launchTask("Synchronizing") {
        val summary = repository.syncPending()
        if (_uiState.value.settings.isLoggedIn) applySnapshot(repository.refresh())
        showMessage("Synced ${summary.synced}/${summary.attempted}; ${summary.failed} failed.")
    }

    fun addVehicle(name: String, plate: String?, odometer: Double?, onSaved: (Vehicle) -> Unit = {}) {
        if (name.isBlank()) {
            showMessage("Enter a vehicle name.")
            return
        }
        launchTask("Saving vehicle") {
            val vehicle = repository.addVehicle(name, plate, odometer)
            onSaved(vehicle)
            showMessage("Vehicle saved offline.")
        }
    }

    fun addRecord(input: RecordDraftInput) {
        if (input.title.isBlank() && !input.fuel) {
            showMessage("Enter a title.")
            return
        }
        if (!DATE_PATTERN.matches(input.date)) {
            showMessage("Enter the date as YYYY-MM-DD.")
            return
        }
        if (input.fuel && (input.odometer == null || input.fuelQuantity == null || input.fuelQuantity <= 0)) {
            showMessage("Fuel entries need odometer and quantity.")
            return
        }
        launchTask("Saving record") {
            repository.addDraft(input)
            showMessage("Record saved offline.")
        }
    }

    fun deleteDraft(id: Long) = launchTask("Deleting draft") {
        repository.deleteDraft(id)
        showMessage("Draft deleted.")
    }

    fun loadTrip(id: String) {
        if (_uiState.value.tripDetails.containsKey(id)) return
        launchTask("Loading trip") {
            val detail = repository.tripDetail(id)
            _uiState.update { it.copy(tripDetails = it.tripDetails + (id to detail)) }
        }
    }

    fun loadDevicePositions(deviceId: String, hours: Int = 6) = launchTask("Loading route") {
        val positions = repository.devicePositions(deviceId, hours)
        _uiState.update { it.copy(devicePositions = it.devicePositions + (deviceId to positions)) }
    }

    fun toggleFavorite(trip: Trip) = launchTask("Updating trip") {
        val updated = repository.toggleFavorite(trip)
        _uiState.update { state ->
            state.copy(
                trips = state.trips.map { if (it.id == updated.id) updated else it },
                tripDetails = state.tripDetails.mapValues { (_, detail) ->
                    if (detail.trip.id == updated.id) detail.copy(trip = updated) else detail
                },
            )
        }
    }

    fun createTrip(
        deviceId: String,
        vehicleId: String?,
        name: String?,
        start: String,
        end: String,
        favorite: Boolean,
    ) {
        if (deviceId.isBlank() || start.isBlank() || end.isBlank()) {
            showMessage("Device, start time, and end time are required.")
            return
        }
        launchTask("Creating trip") {
            val trip = repository.createTrip(deviceId, vehicleId, name, start, end, favorite)
            _uiState.update { it.copy(trips = listOf(trip) + it.trips.filterNot { old -> old.id == trip.id }) }
            showMessage("Trip created.")
        }
    }

    fun saveTracking(deviceId: String, endpoint: String, interval: Int, distance: Int) =
        launchTask("Saving tracker settings") {
            repository.saveTracking(deviceId, endpoint, interval, distance)
            showMessage("Tracker settings saved.")
        }

    fun startTracking() {
        ContextCompat.startForegroundService(context, Intent(context, TrackingService::class.java))
        showMessage("Continuous tracking started.")
    }

    fun stopTracking() {
        context.stopService(Intent(context, TrackingService::class.java))
        viewModelScope.launch { runCatching { repository.updateTrackerState(false) } }
        showMessage("Continuous tracking stopped.")
    }

    fun sendCurrentLocation() {
        val permitted =
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        if (!permitted) {
            showMessage("Location permission is required.")
            return
        }
        launchTask("Sending location") {
            val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val location = manager.getProviders(true)
                .mapNotNull { provider -> runCatching { manager.getLastKnownLocation(provider) }.getOrNull() }
                .maxByOrNull { it.time }
                ?: error("No recent location is available yet.")
            val settings = repository.settingsRepository.current()
            repository.enqueuePosition(
                deviceLabel = settings.trackingDeviceId,
                timestamp = Instant.ofEpochMilli(location.time.takeIf { it > 0 } ?: System.currentTimeMillis()).toString(),
                latitude = location.latitude,
                longitude = location.longitude,
                speed = if (location.hasSpeed()) location.speed.toDouble() * 3.6 else null,
                accuracy = if (location.hasAccuracy()) location.accuracy.toDouble() else null,
            )
            val result = runCatching { repository.flushPositions() }.getOrNull()
            showMessage(
                if (result?.synced == 1) "Current location sent."
                else "Location saved offline and will retry automatically."
            )
        }
    }

    private fun launchTask(label: String, work: suspend () -> Unit) {
        viewModelScope.launch {
            _uiState.update { it.copy(busy = true, busyLabel = label) }
            try {
                work()
            } catch (error: Exception) {
                showMessage(error.message ?: "Something went wrong.")
            } finally {
                _uiState.update { it.copy(busy = false, busyLabel = "") }
            }
        }
    }

    private fun applySnapshot(snapshot: RefreshSnapshot) {
        _uiState.update {
            it.copy(
                devices = snapshot.devices,
                trips = snapshot.trips,
                records = snapshot.records,
                fuelRecords = snapshot.fuelRecords,
            )
        }
    }

    private fun showMessage(message: String) = _uiState.update { it.copy(message = message) }

    private data class LocalState(
        val settings: AppSettings,
        val vehicles: List<Vehicle>,
        val drafts: List<DraftRecord>,
        val queued: Int,
    )

    companion object {
        private val DATE_PATTERN = Regex("""\d{4}-\d{2}-\d{2}""")
    }
}
