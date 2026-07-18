package com.movara.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Bundle
import android.text.InputType
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import java.time.Instant
import com.google.android.material.appbar.MaterialToolbar
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {
    private lateinit var settings: MovaraSettings
    private lateinit var store: MovaraStore
    private lateinit var api: MovaraApiClient
    private lateinit var content: LinearLayout
    private lateinit var statusText: TextView

    private var vehicles: List<Vehicle> = emptyList()
    private var devices: List<Device> = emptyList()
    private var trips: List<Trip> = emptyList()
    private var records: List<VehicleRecord> = emptyList()
    private var fuelRecords: List<FuelRecord> = emptyList()
    private var selectedTripDetail: TripDetail? = null
    private var currentTab: Tab = Tab.HOME

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        settings = MovaraSettings(this)
        store = MovaraStore(this)
        api = MovaraApiClient(settings)
        vehicles = store.vehicles()
        buildShell()
        render()
    }

    override fun onCreateOptionsMenu(menu: Menu?): Boolean {
        menuInflater.inflate(R.menu.main, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_server_settings -> {
                showServerDialog()
                true
            }
            R.id.action_logout -> {
                settings.clearSession()
                render()
                toast("Logged out. Offline drafts stay on this phone.")
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == LOCATION_PERMISSION_REQUEST && grantResults.any { it == PackageManager.PERMISSION_GRANTED }) {
            sendCurrentLocation()
        } else if (requestCode == TRACKING_PERMISSION_REQUEST && grantResults.any { it == PackageManager.PERMISSION_GRANTED }) {
            startContinuousTracking()
        }
    }

    private fun buildShell() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(COLOR_BG)
        }
        val toolbar = MaterialToolbar(this).apply {
            title = "Movara"
            setTitleTextColor(0xffffffff.toInt())
            setBackgroundColor(COLOR_INK)
        }
        root.addView(toolbar, LinearLayout.LayoutParams.MATCH_PARENT, dp(54))

        val scroll = ScrollView(this)
        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(14), dp(16), dp(26))
        }
        scroll.addView(content)
        root.addView(scroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

        val nav = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(10), dp(8), dp(10), dp(8))
            background = rounded(0xffffffff.toInt(), COLOR_LINE, 0)
        }
        Tab.values().forEach { tab ->
            nav.addView(navButton(tab), LinearLayout.LayoutParams(0, dp(48), 1f))
        }
        root.addView(nav)
        setContentView(root)
        setSupportActionBar(toolbar)
    }

    private fun navButton(tab: Tab): TextView {
        return TextView(this).apply {
            text = tab.label
            textSize = 12f
            gravity = Gravity.CENTER
            setTextColor(if (tab == currentTab) COLOR_INK else COLOR_MUTED)
            background = if (tab == currentTab) rounded(COLOR_NAV_SELECTED, 0, 18) else rounded(0x00000000, 0, 18)
            setOnClickListener {
                currentTab = tab
                selectedTripDetail = null
                buildShell()
                render()
            }
        }
    }

    private fun render() {
        content.removeAllViews()
        vehicles = store.vehicles()
        when (currentTab) {
            Tab.HOME -> renderHome()
            Tab.RECORDS -> renderRecords()
            Tab.TRACKING -> renderTracking()
            Tab.DEVICES -> renderDevices()
            Tab.TRIPS -> selectedTripDetail?.let { renderTripDetail(it) } ?: renderTrips()
        }
    }

    private fun renderHome() {
        content.addView(homeHeader())
        content.addView(quickActionDock())
        content.addView(sectionTitle("Fleet", "${vehicles.size} cached vehicles"))
        if (vehicles.isEmpty()) {
            content.addView(emptyState("Refresh once to cache vehicles for offline use."))
        } else {
            vehicles.take(4).forEach { vehicle ->
                content.addView(dataRow(
                    marker = "V",
                    title = vehicle.name,
                    meta = vehicle.licensePlate ?: "Vehicle",
                    detail = "Odometer ${vehicle.odometer?.toLong() ?: 0} km"
                ))
            }
        }

        content.addView(sectionTitle("Recent Trips", "${trips.size} trips available offline"))
        if (trips.isEmpty()) {
            content.addView(emptyState("No trips loaded."))
        } else {
            trips.take(3).forEach { trip ->
                content.addView(tripTimelineRow(trip) {
                    showTripDetail(trip)
                })
            }
        }

        content.addView(sectionTitle("Offline Queue", "records and GPS kept on this phone first"))
        content.addView(queuePanel())
    }

    private fun renderRecords() {
        content.addView(screenHeader("Records", "Add fuel, maintenance, documents, and expenses offline.", "Refresh") {
            refreshRecords()
        })
        content.addView(recordComposer())

        content.addView(sectionTitle("Pending Sync", "${store.drafts().size} drafts waiting"))
        val drafts = store.drafts()
        if (drafts.isEmpty()) {
            content.addView(emptyState("No pending records."))
        } else {
            drafts.forEach { draft ->
                content.addView(dataRow(
                    marker = if (draft.syncKind == "fuel") "F" else "R",
                    title = draft.title,
                    meta = draft.vehicleName,
                    detail = "${draft.date} / ${draft.syncKind}${draft.lastError?.let { "\n$it" } ?: ""}",
                    onClick = {
                        AlertDialog.Builder(this)
                            .setTitle("Delete draft?")
                            .setMessage(draft.title)
                            .setNegativeButton("Cancel", null)
                            .setPositiveButton("Delete") { _, _ ->
                                store.deleteDraft(draft.id)
                                render()
                            }
                            .show()
                    }
                ))
            }
            content.addView(primaryButton("Sync pending") { syncDrafts() })
        }

        content.addView(sectionTitle("Stored Records", "${records.size + fuelRecords.size} synced records loaded"))
        if (records.isEmpty() && fuelRecords.isEmpty()) {
            content.addView(emptyState("No stored records loaded yet."))
        } else {
            fuelRecords.forEach { fuel ->
                val detail = listOf(
                    fuel.date,
                    "${format1(fuel.fuelQuantity)} L",
                    fuel.fuelCost?.let { "cost ${format1(it)}" }.orEmpty(),
                    "odo ${fuel.odometer.toLong()} km"
                ).filter { it.isNotBlank() }.joinToString(" / ")
                content.addView(dataRow("F", "Fuel fill-up", fuel.vehicleName ?: "Fuel", detail, COLOR_FUEL))
            }
            records.forEach { record ->
                val numbers = listOfNotNull(
                    record.odometer?.let { "odo ${it.toLong()} km" },
                    record.amount?.let { "amount ${format1(it)}" }
                ).joinToString(" / ")
                val detail = listOf(record.date, "${record.type}/${record.subtype ?: "other"}", numbers, record.notes.orEmpty())
                    .filter { it.isNotBlank() }
                    .joinToString("\n")
                content.addView(dataRow("R", record.title, record.vehicleName ?: record.type, detail))
            }
        }
    }

    private fun recordComposer(): LinearLayout {
        return panel {
            addView(panelHeader("New Offline Record", "Saved locally first, then synced when Movara is available."))
            val modeSpinner = spinner(RECORD_MODES)
            val vehicleSpinner = spinner(vehicleLabels())
            val typeCaption = caption("Type")
            val typeSpinner = spinner(RECORD_TYPES)
            val subtypeCaption = caption("Subtype")
            val subtypeSpinner = spinner(RECORD_SUBTYPES)
            val titleInput = input("Title, e.g. Oil service")
            val dateInput = input("YYYY-MM-DD").apply {
                setText(today())
                inputType = InputType.TYPE_CLASS_DATETIME
            }
            val odometerInput = input("Odometer").apply { inputType = InputType.TYPE_CLASS_NUMBER }
            val fuelQuantityCaption = caption("Fuel quantity")
            val fuelQuantityInput = input("Fuel quantity").apply {
                inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
            }
            val amountCaption = caption("Amount")
            val amountInput = input("Amount").apply {
                inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
            }
            val notesInput = input("Notes").apply {
                minLines = 3
                gravity = Gravity.TOP
            }

            fun applyMode() {
                val fuelMode = modeSpinner.selectedItemPosition == MODE_FUEL
                typeCaption.visibility = if (fuelMode) View.GONE else View.VISIBLE
                typeSpinner.visibility = if (fuelMode) View.GONE else View.VISIBLE
                subtypeCaption.visibility = if (fuelMode) View.GONE else View.VISIBLE
                subtypeSpinner.visibility = if (fuelMode) View.GONE else View.VISIBLE
                fuelQuantityCaption.visibility = if (fuelMode) View.VISIBLE else View.GONE
                fuelQuantityInput.visibility = if (fuelMode) View.VISIBLE else View.GONE
                titleInput.hint = if (fuelMode) "Fuel fill-up" else "Title, e.g. Oil service"
                amountCaption.text = if (fuelMode) "Fuel cost" else "Amount"
            }

            modeSpinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) = applyMode()
                override fun onNothingSelected(parent: AdapterView<*>?) = Unit
            }

            addView(caption("Mode"))
            addView(modeSpinner)
            addView(caption("Vehicle"))
            addView(vehicleSpinner)
            addView(typeCaption)
            addView(typeSpinner)
            addView(subtypeCaption)
            addView(subtypeSpinner)
            addView(caption("Title"))
            addView(titleInput)
            addView(caption("Date"))
            addView(dateInput)
            addView(caption("Odometer"))
            addView(odometerInput)
            addView(fuelQuantityCaption)
            addView(fuelQuantityInput)
            addView(amountCaption)
            addView(amountInput)
            addView(caption("Notes"))
            addView(notesInput)
            addView(primaryButton("Save offline") {
                saveDraft(
                    vehicleIndex = vehicleSpinner.selectedItemPosition,
                    fuelMode = modeSpinner.selectedItemPosition == MODE_FUEL,
                    typeIndex = typeSpinner.selectedItemPosition,
                    subtypeIndex = subtypeSpinner.selectedItemPosition,
                    title = titleInput.text.toString(),
                    date = dateInput.text.toString(),
                    odometer = odometerInput.text.toString(),
                    fuelQuantity = fuelQuantityInput.text.toString(),
                    amount = amountInput.text.toString(),
                    notes = notesInput.text.toString()
                )
            })
            applyMode()
        }
    }

    private fun renderTracking() {
        content.addView(screenHeader("Tracking", "Phone GPS queues offline and uploads when Movara is reachable.", "Sync GPS") {
            flushQueuedPositions()
        })
        content.addView(panel {
            addView(panelHeader("Phone Tracker", "${store.queuedPositionCount()} queued points"))
            addView(statsStrip(listOf(
                "Mode" to "30 sec",
                "Distance" to "25 m",
                "Queue" to store.queuedPositionCount().toString()
            )))
            addView(actionRow(
                "Start" to { startContinuousTracking() },
                "Stop" to { stopContinuousTracking() },
                "One point" to { sendCurrentLocation() }
            ))
        })
        content.addView(sectionTitle("Device Positions", "${devices.size} devices loaded"))
        if (devices.isEmpty()) {
            content.addView(emptyState("Refresh devices to show live positions."))
        } else {
            devices.forEach { device ->
                content.addView(dataRow(
                    marker = device.status.take(1).uppercase(Locale.US).ifBlank { "D" },
                    title = device.name ?: device.imei,
                    meta = device.status.uppercase(Locale.US),
                    detail = "Protocol ${device.protocol}\nLast seen ${device.lastSeen ?: "never"}",
                    accent = statusColor(device.status),
                    onClick = { loadLatestPositions(device) }
                ))
            }
        }
    }

    private fun renderDevices() {
        content.addView(screenHeader("Devices", "Trackers connected to Movara.", "Refresh") {
            refreshDevices()
        })
        if (devices.isEmpty()) {
            content.addView(emptyState("No devices loaded yet."))
        } else {
            content.addView(statsStrip(listOf(
                "Total" to devices.size.toString(),
                "Online" to devices.count { it.status.equals("online", true) }.toString(),
                "Offline" to devices.count { !it.status.equals("online", true) }.toString()
            )))
            devices.forEach { device ->
                content.addView(dataRow(
                    marker = "D",
                    title = device.name ?: "Unnamed device",
                    meta = device.status.uppercase(Locale.US),
                    detail = "IMEI ${device.imei}\nProtocol ${device.protocol}\nLast seen ${device.lastSeen ?: "never"}",
                    accent = statusColor(device.status),
                    onClick = { loadLatestPositions(device) }
                ))
            }
        }
    }

    private fun renderTrips() {
        content.addView(screenHeader("Trips", "Full trip history, maps, stops, and fuel context.", "Refresh") {
            refreshTrips()
        })
        if (trips.isEmpty()) {
            content.addView(emptyState("No trips loaded yet."))
        } else {
            content.addView(statsStrip(listOf(
                "Trips" to trips.size.toString(),
                "Favorites" to trips.count { it.favorite }.toString(),
                "Vehicles" to trips.mapNotNull { it.vehicleId }.distinct().size.toString()
            )))
            var lastBucket = ""
            trips.forEach { trip ->
                val bucket = trip.startTime.replace('T', ' ').take(10)
                if (bucket != lastBucket) {
                    content.addView(dateDivider(bucket))
                    lastBucket = bucket
                }
                content.addView(tripTimelineRow(trip) {
                    showTripDetail(trip)
                })
            }
        }
    }

    private fun showTripDetail(trip: Trip) {
        runBackground(
            work = { api.fetchTripDetail(trip.id) },
            done = { detail ->
                val relevantFuel = fuelRecords.filter { fuel ->
                    fuel.vehicleId == detail.trip.vehicleId && within(fuel.date, detail.trip.startTime, detail.trip.endTime)
                }
                selectedTripDetail = detail.copy(
                    stops = if (detail.stops.isEmpty()) detectStops(detail.positions) else detail.stops,
                    fuelStops = relevantFuel
                )
                render()
            }
        )
    }

    private fun renderTripDetail(detail: TripDetail) {
        content.addView(secondaryButton("Back to trips") {
            selectedTripDetail = null
            render()
        })
        content.addView(screenHeader(detail.trip.label, detail.trip.vehicleName ?: detail.trip.deviceName ?: detail.trip.source, null, null))
        content.addView(mapPanel(detail.positions))
        val stats = detail.stats
        content.addView(panel {
            addView(panelHeader("Trip Window", compactRange(detail.trip.startTime, detail.trip.endTime)))
        })
        if (stats != null) {
            content.addView(statsStrip(listOf(
                "Distance" to "${format1(stats.odometerKm)} km",
                "Max" to "${format1(stats.maxSpeedKmh)} km/h",
                "Avg" to "${format1(stats.avgSpeedKmh)} km/h",
                "Points" to stats.pointCount.toString()
            )))
        }
        content.addView(sectionTitle("Stops", "manual, detected, and fuel stops"))
        val allStops = detail.stops + detail.fuelStops.mapNotNull { fuel ->
            if (fuel.latitude != null && fuel.longitude != null) {
                TripStop("Fuel stop", fuel.date, null, fuel.latitude, fuel.longitude, "fuel")
            } else null
        }
        if (allStops.isEmpty()) {
            content.addView(emptyState("No manual, detected, or fuel stops for this trip."))
        } else {
            allStops.sortedBy { it.startTime }.forEach { stop ->
                content.addView(dataRow(
                    marker = if (stop.source == "fuel") "F" else "S",
                    title = stop.label,
                    meta = stop.source,
                    detail = "${compactRange(stop.startTime, stop.endTime ?: stop.startTime)}\n${formatCoord(stop.latitude)}, ${formatCoord(stop.longitude)}",
                    accent = if (stop.source == "fuel") COLOR_FUEL else COLOR_ACCENT
                ))
            }
        }
    }

    private fun refreshAll() {
        runBackground(
            work = {
                val freshVehicles = api.fetchVehicles()
                val freshDevices = api.fetchDevices()
                val freshTrips = api.fetchTrips()
                val freshRecords = api.fetchVehicleRecords()
                val freshFuelRecords = api.fetchFuelRecords(freshVehicles)
                RefreshBundle(freshVehicles, freshDevices, freshTrips, freshRecords, freshFuelRecords)
            },
            done = { result ->
                store.replaceVehicles(result.vehicles)
                devices = result.devices
                trips = result.trips
                records = result.records
                fuelRecords = result.fuelRecords
                render()
                toast("Companion data refreshed.")
            }
        )
    }

    private fun refreshRecords() {
        runBackground(
            work = { api.fetchVehicleRecords() to api.fetchFuelRecords(vehicles) },
            done = {
                records = it.first
                fuelRecords = it.second
                render()
                toast("Stored records refreshed.")
            }
        )
    }

    private fun refreshDevices() {
        runBackground(
            work = { api.fetchDevices() },
            done = {
                devices = it
                render()
                toast("Devices refreshed.")
            }
        )
    }

    private fun refreshTrips() {
        runBackground(
            work = { api.fetchTrips() },
            done = {
                trips = it
                render()
                toast("Trips refreshed.")
            }
        )
    }

    private fun loadLatestPositions(device: Device) {
        runBackground(
            work = { api.fetchLatestPositions(device.id) },
            done = { positions ->
                AlertDialog.Builder(this)
                    .setTitle(device.name ?: device.imei)
                    .setMessage(
                        if (positions.isEmpty()) {
                            "No positions found."
                        } else {
                            positions.joinToString("\n\n") {
                                "${it.timestamp}\n${it.latitude}, ${it.longitude}\nSpeed: ${it.speed ?: 0.0}"
                            }
                        }
                    )
                    .setPositiveButton("OK", null)
                    .show()
            }
        )
    }

    private fun saveDraft(
        vehicleIndex: Int,
        fuelMode: Boolean,
        typeIndex: Int,
        subtypeIndex: Int,
        title: String,
        date: String,
        odometer: String,
        fuelQuantity: String,
        amount: String,
        notes: String
    ) {
        val selectedVehicle = vehicles.getOrNull(vehicleIndex)
        if (selectedVehicle == null) {
            toast("Refresh vehicles once before adding records.")
            return
        }
        val cleanTitle = title.trim()
        if (!fuelMode && cleanTitle.isBlank()) {
            toast("Enter a title.")
            return
        }
        val cleanDate = date.trim()
        if (!isValidDate(cleanDate)) {
            toast("Enter a valid date as YYYY-MM-DD.")
            return
        }
        val odometerValue = odometer.toDoubleOrNull()
        val amountValue = amount.toDoubleOrNull()
        val fuelQuantityValue = fuelQuantity.toDoubleOrNull()
        if (fuelMode && (odometerValue == null || odometerValue < 0)) {
            toast("Fuel records need a valid odometer.")
            return
        }
        if (fuelMode && (fuelQuantityValue == null || fuelQuantityValue <= 0)) {
            toast("Fuel records need a fuel quantity.")
            return
        }
        if (amountValue != null && amountValue < 0) {
            toast("Amount cannot be negative.")
            return
        }
        store.addDraft(
            syncKind = if (fuelMode) "fuel" else "vehicle_record",
            vehicle = selectedVehicle,
            type = if (fuelMode) "expense" else RECORD_TYPES[typeIndex],
            subtype = if (fuelMode) "custom" else RECORD_SUBTYPES[subtypeIndex],
            title = if (fuelMode && cleanTitle.isBlank()) "Fuel fill-up" else cleanTitle,
            date = cleanDate,
            odometer = odometerValue,
            amount = amountValue,
            fuelQuantity = fuelQuantityValue,
            notes = notes.trim().ifBlank { null }
        )
        render()
        toast("Saved offline.")
    }

    private fun syncDrafts() {
        runBackground(
            work = {
                val drafts = store.drafts().sortedBy { it.createdAt }
                var synced = 0
                var failed = 0
                drafts.forEach { draft ->
                    try {
                        api.createVehicleRecord(draft)
                        store.deleteDraft(draft.id)
                        synced += 1
                    } catch (error: Exception) {
                        store.markDraftError(draft.id, error.message ?: "Sync failed")
                        failed += 1
                    }
                }
                SyncResult(drafts.size, synced, failed)
            },
            done = { result ->
                render()
                toast("Sync: ${result.synced}/${result.attempted} sent, ${result.failed} failed.")
            }
        )
    }

    private fun sendCurrentLocation() {
        if (!hasLocationPermission()) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                LOCATION_PERMISSION_REQUEST
            )
            return
        }
        val manager = getSystemService(LOCATION_SERVICE) as LocationManager
        val location = latestLocation(manager)
        if (location == null) {
            toast("No location available yet. Turn on location and try again.")
            return
        }
        runBackground(
            work = {
                val queuedId = store.addQueuedPosition(
                    deviceLabel = android.os.Build.MODEL ?: "phone",
                    timestamp = Instant.ofEpochMilli(location.time.takeIf { it > 0 } ?: System.currentTimeMillis()).toString(),
                    latitude = location.latitude,
                    longitude = location.longitude,
                    speed = if (location.hasSpeed()) location.speed.toDouble() * 3.6 else null,
                    accuracy = if (location.hasAccuracy()) location.accuracy.toDouble() else null
                )
                TrackingSync.flush(store, api)
                queuedId
            },
            done = {
                render()
                toast("Phone location queued and sync attempted.")
            }
        )
    }

    private fun startContinuousTracking() {
        if (!hasLocationPermission()) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                TRACKING_PERMISSION_REQUEST
            )
            return
        }
        ContextCompat.startForegroundService(this, Intent(this, TrackingService::class.java))
        toast("Continuous tracking started.")
        render()
    }

    private fun stopContinuousTracking() {
        stopService(Intent(this, TrackingService::class.java))
        toast("Continuous tracking stopped.")
        render()
    }

    private fun flushQueuedPositions() {
        runBackground(
            work = { TrackingSync.flush(store, api) },
            done = {
                render()
                toast("GPS sync: ${it.synced}/${it.attempted} sent, ${it.failed} failed.")
            }
        )
    }

    private fun latestLocation(manager: LocationManager): Location? {
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
        return providers.mapNotNull { provider ->
            runCatching {
                if (manager.isProviderEnabled(provider)) manager.getLastKnownLocation(provider) else null
            }.getOrNull()
        }.maxByOrNull { it.time }
    }

    private fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    }

    private fun showServerDialog() {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(8), dp(20), 0)
        }
        val serverInput = input("https://movara.example.com").apply { setText(settings.serverUrl.orEmpty()) }
        val emailInput = input("Email").apply {
            setText(settings.userEmail.orEmpty())
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        }
        val passwordInput = input("Password").apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        layout.addView(caption("Movara server"))
        layout.addView(serverInput)
        layout.addView(caption("Email"))
        layout.addView(emailInput)
        layout.addView(caption("Password"))
        layout.addView(passwordInput)

        AlertDialog.Builder(this)
            .setTitle("Server settings")
            .setMessage("Records work offline. Login is needed for refresh, sync, trips, devices, and tracking upload.")
            .setView(layout)
            .setNegativeButton("Save offline") { _, _ ->
                if (saveServerUrl(serverInput.text.toString())) render()
            }
            .setPositiveButton("Login") { _, _ ->
                if (saveServerUrl(serverInput.text.toString())) {
                    settings.userEmail = emailInput.text.toString()
                    login(emailInput.text.toString(), passwordInput.text.toString())
                }
            }
            .show()
    }

    private fun saveServerUrl(rawUrl: String): Boolean {
        val url = rawUrl.trim().removeSuffix("/")
        if (url.isBlank()) {
            toast("Enter a server URL.")
            return false
        }
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            toast("Server URL must start with http:// or https://.")
            return false
        }
        settings.serverUrl = url
        return true
    }

    private fun login(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            toast("Enter email and password.")
            return
        }
        runBackground(
            work = {
                val token = api.login(email, password)
                settings.token = token
                val freshVehicles = api.fetchVehicles()
                RefreshBundle(
                    freshVehicles,
                    api.fetchDevices(),
                    api.fetchTrips(),
                    api.fetchVehicleRecords(),
                    api.fetchFuelRecords(freshVehicles)
                )
            },
            done = {
                store.replaceVehicles(it.vehicles)
                devices = it.devices
                trips = it.trips
                records = it.records
                fuelRecords = it.fuelRecords
                render()
                toast("Logged in and refreshed.")
            }
        )
    }

    private fun connectionSummary(): String {
        val server = settings.serverUrl ?: "No server configured"
        val session = if (settings.token.isNullOrBlank()) "offline only" else "logged in"
        return "$server\n$session - ${vehicles.size} vehicles - ${store.drafts().size} records - ${store.queuedPositionCount()} GPS queued"
    }

    private fun homeHeader(): LinearLayout {
        val queued = store.drafts().size + store.queuedPositionCount()
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(18), dp(18), dp(16))
            background = rounded(COLOR_INK, 0, 26)
            layoutParams = blockParams(bottom = 12)
            addView(TextView(this@MainActivity).apply {
                text = if (settings.token.isNullOrBlank()) "Offline Companion" else "Connected Companion"
                textSize = 13f
                setTextColor(0xffa7f3d0.toInt())
            })
            addView(TextView(this@MainActivity).apply {
                text = "Movara"
                textSize = 30f
                setTextColor(0xffffffff.toInt())
                setPadding(0, dp(4), 0, dp(4))
            })
            addView(TextView(this@MainActivity).apply {
                text = settings.serverUrl ?: "Set server from the menu. Offline records still work."
                textSize = 13f
                setTextColor(0xffcbd5e1.toInt())
            })
            val row = LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(0, dp(16), 0, 0)
            }
            row.addView(metricMini("Vehicles", vehicles.size.toString(), dark = true), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            row.addView(metricMini("Trips", trips.size.toString(), dark = true), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            row.addView(metricMini("Records", (records.size + fuelRecords.size).toString(), dark = true), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            row.addView(metricMini("Queued", queued.toString(), dark = true), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            addView(row)
        }
    }

    private fun quickActionDock(): HorizontalScrollView {
        val strip = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 0, 0, dp(2))
            addView(pillButton("Refresh all", COLOR_PRIMARY) { refreshAll() })
            addView(pillButton("Sync records", COLOR_ACCENT) { syncDrafts() })
            addView(pillButton("Sync GPS", COLOR_FUEL) { flushQueuedPositions() })
            addView(pillButton("Start tracking", COLOR_INK) { startContinuousTracking() })
        }
        return HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(strip)
            layoutParams = blockParams(bottom = 14)
        }
    }

    private fun queuePanel(): LinearLayout {
        return panel {
            addView(panelHeader("Local-first Sync", connectionSummary()))
            addView(actionRow(
                "Records" to { syncDrafts() },
                "GPS" to { flushQueuedPositions() }
            ))
        }
    }

    private fun screenHeader(title: String, subtitle: String, actionLabel: String?, action: (() -> Unit)?): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(4), 0, dp(12))
            val copy = LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.VERTICAL
                addView(TextView(this@MainActivity).apply {
                    text = title
                    textSize = 26f
                    setTextColor(COLOR_TEXT)
                })
                addView(TextView(this@MainActivity).apply {
                    text = subtitle
                    textSize = 13f
                    setTextColor(COLOR_MUTED)
                })
            }
            addView(copy, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            if (actionLabel != null && action != null) {
                addView(pillButton(actionLabel, COLOR_PRIMARY, action))
            }
        }
    }

    private fun sectionTitle(title: String, subtitle: String): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(14), 0, dp(8))
            addView(TextView(this@MainActivity).apply {
                text = title
                textSize = 17f
                setTextColor(COLOR_TEXT)
            })
            addView(TextView(this@MainActivity).apply {
                text = subtitle
                textSize = 12f
                setTextColor(COLOR_MUTED)
            })
        }
    }

    private fun panelHeader(title: String, subtitle: String): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(TextView(this@MainActivity).apply {
                text = title
                textSize = 17f
                setTextColor(COLOR_TEXT)
            })
            addView(TextView(this@MainActivity).apply {
                text = subtitle
                textSize = 13f
                setTextColor(COLOR_MUTED)
                setPadding(0, dp(2), 0, dp(8))
            })
        }
    }

    private fun metricMini(label: String, value: String, dark: Boolean = false): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(4), dp(8), dp(4), dp(4))
            addView(TextView(this@MainActivity).apply {
                text = value
                textSize = if (dark) 20f else 22f
                setTextColor(if (dark) 0xffffffff.toInt() else COLOR_TEXT)
                gravity = Gravity.CENTER
            })
            addView(TextView(this@MainActivity).apply {
                text = label
                textSize = 11f
                gravity = Gravity.CENTER
                setTextColor(if (dark) 0xffcbd5e1.toInt() else COLOR_MUTED)
            })
        }
    }

    private fun statsStrip(items: List<Pair<String, String>>): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(8), 0, dp(8))
            items.forEach { (label, value) ->
                addView(metricMini(label, value), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            }
        }
    }

    private fun sectionHeader(text: String): TextView {
        return TextView(this).apply {
            this.text = text
            textSize = 16f
            setTextColor(COLOR_TEXT)
            setPadding(0, dp(18), 0, dp(8))
        }
    }

    private fun actionRow(vararg actions: Pair<String, () -> Unit>): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            actions.forEachIndexed { index, item ->
                val button = if (index == 0) primaryButton(item.first, item.second) else secondaryButton(item.first, item.second)
                addView(button, LinearLayout.LayoutParams(0, dp(46), 1f).apply {
                    if (index > 0) setMargins(dp(8), 0, 0, 0)
                })
            }
        }
    }

    private fun dataRow(
        marker: String,
        title: String,
        meta: String,
        detail: String,
        accent: Int = COLOR_PRIMARY,
        onClick: (() -> Unit)? = null
    ): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), dp(12), dp(12), dp(12))
            background = rounded(0xffffffff.toInt(), COLOR_LINE, 18)
            layoutParams = blockParams(bottom = 8)
            isClickable = onClick != null
            onClick?.let { action -> setOnClickListener { action() } }
            addView(TextView(this@MainActivity).apply {
                text = marker.take(2).uppercase(Locale.US)
                textSize = 12f
                gravity = Gravity.CENTER
                setTextColor(0xffffffff.toInt())
                background = rounded(accent, 0, 18)
            }, LinearLayout.LayoutParams(dp(36), dp(36)))
            val copy = LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(12), 0, 0, 0)
                addView(rowText(title, meta))
                if (detail.isNotBlank()) addView(smallText(detail))
            }
            addView(copy, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        }
    }

    private fun tripTimelineRow(trip: Trip, onClick: () -> Unit): LinearLayout {
        val marker = if (trip.favorite) "*" else "T"
        return dataRow(
            marker = marker,
            title = trip.label,
            meta = trip.vehicleName ?: trip.deviceName ?: trip.source,
            detail = compactRange(trip.startTime, trip.endTime),
            accent = if (trip.favorite) COLOR_FUEL else COLOR_ACCENT,
            onClick = onClick
        )
    }

    private fun dateDivider(text: String): TextView {
        return TextView(this).apply {
            this.text = text
            textSize = 12f
            setTextColor(COLOR_MUTED)
            setPadding(dp(4), dp(12), 0, dp(6))
        }
    }

    private fun mapPanel(positions: List<Position>): LinearLayout {
        return panel {
            addView(TripMapDialog.webView(this@MainActivity, positions), LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(330)))
        }
    }

    private fun panel(block: LinearLayout.() -> Unit): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(14), dp(14), dp(14))
            background = rounded(0xffffffff.toInt(), COLOR_LINE, 20)
            layoutParams = blockParams(bottom = 10)
            block()
        }
    }

    private fun pillButton(text: String, color: Int, onClick: () -> Unit): TextView {
        return TextView(this).apply {
            this.text = text
            textSize = 13f
            gravity = Gravity.CENTER
            setTextColor(0xffffffff.toInt())
            setPadding(dp(14), 0, dp(14), 0)
            background = rounded(color, 0, 18)
            setOnClickListener { onClick() }
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(40)).apply {
                setMargins(0, 0, dp(8), 0)
            }
        }
    }

    private fun blockParams(bottom: Int): LinearLayout.LayoutParams {
        return LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            setMargins(0, 0, 0, dp(bottom))
        }
    }

    private fun statusColor(status: String): Int {
        return when (status.lowercase(Locale.US)) {
            "online", "active" -> COLOR_GOOD
            "offline", "inactive" -> COLOR_MUTED
            else -> COLOR_ACCENT
        }
    }

    private fun compactRange(start: String, end: String): String {
        return "${start.replace('T', ' ').take(16)} -> ${end.replace('T', ' ').take(16)}"
    }

    private fun format1(value: Double): String = String.format(Locale.US, "%.1f", value)

    private fun formatCoord(value: Double): String = String.format(Locale.US, "%.5f", value)

    private fun within(value: String, start: String, end: String): Boolean {
        val t = runCatching { java.time.Instant.parse(value).toEpochMilli() }.getOrNull() ?: return false
        val s = runCatching { java.time.Instant.parse(start).toEpochMilli() }.getOrNull() ?: return false
        val e = runCatching { java.time.Instant.parse(end).toEpochMilli() }.getOrNull() ?: return false
        return t in s..e
    }

    private fun detectStops(positions: List<Position>): List<TripStop> {
        if (positions.size < 4) return emptyList()
        val stops = mutableListOf<TripStop>()
        var startIndex: Int? = null
        positions.forEachIndexed { index, position ->
            val stopped = (position.speed ?: 0.0) < 3.0
            if (stopped && startIndex == null) startIndex = index
            if ((!stopped || index == positions.lastIndex) && startIndex != null) {
                val start = startIndex!!
                val end = if (stopped && index == positions.lastIndex) index else index - 1
                if (end > start) {
                    val startTime = runCatching { java.time.Instant.parse(positions[start].timestamp).toEpochMilli() }.getOrNull()
                    val endTime = runCatching { java.time.Instant.parse(positions[end].timestamp).toEpochMilli() }.getOrNull()
                    if (startTime != null && endTime != null && endTime - startTime >= 3 * 60 * 1000) {
                        val mid = positions[(start + end) / 2]
                        stops += TripStop("Detected stop", positions[start].timestamp, positions[end].timestamp, mid.latitude, mid.longitude, "detected")
                    }
                }
                startIndex = null
            }
        }
        return stops
    }

    private fun vehicleLabels(): List<String> {
        return if (vehicles.isEmpty()) listOf("No cached vehicles yet") else vehicles.map {
            listOfNotNull(it.name, it.licensePlate).joinToString(" - ")
        }
    }

    private fun <T> runBackground(work: () -> T, done: (T) -> Unit) {
        Thread {
            try {
                val result = work()
                runOnUiThread { done(result) }
            } catch (error: Exception) {
                runOnUiThread {
                    render()
                    toast(error.message ?: "Something went wrong.")
                }
            }
        }.start()
    }

    private fun card(block: LinearLayout.() -> Unit): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = rounded(0xffffffff.toInt(), 0xffe2e8f0.toInt(), 18)
            val params = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            params.setMargins(0, 0, 0, dp(10))
            layoutParams = params
            block()
        }
    }

    private fun listRow(title: String, meta: String, detail: String, onClick: (() -> Unit)? = null): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(12), 0, dp(12))
            isClickable = onClick != null
            onClick?.let { action -> setOnClickListener { action() } }
            addView(rowText(title, meta))
            if (detail.isNotBlank()) addView(smallText(detail))
            addView(View(this@MainActivity).apply {
                setBackgroundColor(0xffe2e8f0.toInt())
            }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 1))
        }
    }

    private fun metricCard(label: String, value: String, detail: String): LinearLayout {
        return card {
            addView(smallText(label.uppercase(Locale.US)))
            addView(TextView(this@MainActivity).apply {
                text = value
                textSize = 28f
                setTextColor(COLOR_TEXT)
            })
            addView(smallText(detail))
        }
    }

    private fun primaryButton(text: String, onClick: () -> Unit): Button {
        return button(text, COLOR_PRIMARY, 0xffffffff.toInt(), onClick)
    }

    private fun secondaryButton(text: String, onClick: () -> Unit): Button {
        return button(text, 0xffe2e8f0.toInt(), COLOR_TEXT, onClick)
    }

    private fun button(text: String, bg: Int, fg: Int, onClick: () -> Unit): Button {
        return Button(this).apply {
            this.text = text
            isAllCaps = false
            setTextColor(fg)
            background = rounded(bg, 0, 18)
            setOnClickListener { onClick() }
        }
    }

    private fun rounded(fill: Int, stroke: Int, radiusDp: Int): GradientDrawable {
        return GradientDrawable().apply {
            setColor(fill)
            cornerRadius = dp(radiusDp).toFloat()
            if (stroke != 0) setStroke(dp(1), stroke)
        }
    }

    private fun input(hintText: String): EditText {
        return EditText(this).apply {
            hint = hintText
            setSingleLine(false)
            setPadding(dp(10), dp(7), dp(10), dp(7))
        }
    }

    private fun spinner(items: List<String>): Spinner {
        return Spinner(this).apply {
            adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, items)
        }
    }

    private fun title(text: String): TextView {
        return TextView(this).apply {
            this.text = text
            textSize = 22f
            setTextColor(COLOR_TEXT)
            setPadding(0, dp(10), 0, dp(8))
        }
    }

    private fun caption(text: String): TextView {
        return smallText(text).apply {
            setPadding(0, dp(8), 0, 0)
        }
    }

    private fun rowText(left: String, right: String): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(TextView(this@MainActivity).apply {
                text = left
                textSize = 16f
                setTextColor(COLOR_TEXT)
            }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            addView(TextView(this@MainActivity).apply {
                text = right
                textSize = 13f
                gravity = Gravity.END
                setTextColor(COLOR_MUTED)
            })
        }
    }

    private fun smallText(textValue: String): TextView {
        return TextView(this).apply {
            text = textValue
            textSize = 13f
            setTextColor(COLOR_MUTED)
        }
    }

    private fun errorText(textValue: String): TextView {
        return TextView(this).apply {
            text = textValue
            textSize = 13f
            setTextColor(0xffb91c1c.toInt())
        }
    }

    private fun emptyState(text: String): TextView {
        return smallText(text).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(20), 0, dp(20))
        }
    }

    private fun space(height: Int) {
        content.addView(View(this), LinearLayout.LayoutParams(1, dp(height)))
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    private fun today(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    private fun isValidDate(value: String): Boolean {
        return try {
            val format = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            format.isLenient = false
            val parsed = format.parse(value)
            parsed != null && format.format(parsed) == value
        } catch (_: Exception) {
            false
        }
    }

    private enum class Tab(val label: String) {
        HOME("Home"),
        RECORDS("Records"),
        TRACKING("Tracking"),
        DEVICES("Devices"),
        TRIPS("Trips")
    }

    private data class RefreshBundle(
        val vehicles: List<Vehicle>,
        val devices: List<Device>,
        val trips: List<Trip>,
        val records: List<VehicleRecord>,
        val fuelRecords: List<FuelRecord>
    )

    companion object {
        private const val LOCATION_PERMISSION_REQUEST = 42
        private const val TRACKING_PERMISSION_REQUEST = 43
        private const val MODE_FUEL = 1
        private const val COLOR_PRIMARY = 0xff0f766e.toInt()
        private const val COLOR_ACCENT = 0xff2563eb.toInt()
        private const val COLOR_FUEL = 0xffb45309.toInt()
        private const val COLOR_GOOD = 0xff15803d.toInt()
        private const val COLOR_INK = 0xff111827.toInt()
        private const val COLOR_NAV_SELECTED = 0xffd1fae5.toInt()
        private const val COLOR_BG = 0xfff8fafc.toInt()
        private const val COLOR_TEXT = 0xff0f172a.toInt()
        private const val COLOR_MUTED = 0xff64748b.toInt()
        private const val COLOR_LINE = 0xffe5e7eb.toInt()
        private val RECORD_MODES = listOf("Vehicle record", "Fuel fill-up")
        private val RECORD_TYPES = listOf("maintenance", "document", "subscription", "expense", "accessory")
        private val RECORD_SUBTYPES = listOf(
            "service",
            "repair",
            "inspection",
            "other",
            "insurance_third_party",
            "insurance_own_damage",
            "pollution_check",
            "registration",
            "sim_recharge",
            "tracker_purchase",
            "accessory_purchase",
            "permit",
            "warranty",
            "custom"
        )
    }
}
