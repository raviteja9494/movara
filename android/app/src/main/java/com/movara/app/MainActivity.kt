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
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import java.time.Instant
import com.google.android.material.appbar.MaterialToolbar
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {
    private lateinit var settings: MovaraSettings
    private lateinit var store: MovaraStore
    private lateinit var api: MovaraApiClient
    private lateinit var toolbar: MaterialToolbar
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var content: LinearLayout

    private var vehicles: List<Vehicle> = emptyList()
    private var devices: List<Device> = emptyList()
    private var trips: List<Trip> = emptyList()
    private var records: List<VehicleRecord> = emptyList()
    private var fuelRecords: List<FuelRecord> = emptyList()
    private var selectedVehicle: Vehicle? = null
    private var selectedTripDetail: TripDetail? = null
    private var selectedDevice: Device? = null
    private var selectedDevicePositions: List<Position> = emptyList()
    private var vehicleSection: VehicleSection = VehicleSection.OVERVIEW
    private var vehicleDateFrom: String = ""
    private var vehicleDateTo: String = ""
    private var recordFilter: RecordFilter = RecordFilter.ALL
    private var tripFilter: TripFilter = TripFilter.ALL
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
        toolbar.overflowIcon?.setTint(0xffffffff.toInt())
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_sync_all -> {
                syncAll()
                true
            }
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
        toolbar = MaterialToolbar(this).apply {
            title = "Movara"
            setTitleTextColor(0xffffffff.toInt())
            setBackgroundColor(COLOR_INK)
        }
        root.addView(toolbar, LinearLayout.LayoutParams.MATCH_PARENT, dp(54))

        swipeRefresh = SwipeRefreshLayout(this).apply {
            setColorSchemeColors(COLOR_PRIMARY, COLOR_ACCENT, COLOR_FUEL)
            setOnRefreshListener { refreshCurrentTab() }
        }
        val scroll = ScrollView(this)
        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(14), dp(16), dp(26))
        }
        scroll.addView(content)
        swipeRefresh.addView(scroll)
        root.addView(swipeRefresh, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

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
        toolbar.post { toolbar.overflowIcon?.setTint(0xffffffff.toInt()) }
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
                selectedVehicle = null
                selectedDevice = null
                selectedDevicePositions = emptyList()
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
            Tab.RECORDS -> selectedVehicle?.let { renderVehicleDetail(it) } ?: renderVehicles()
            Tab.TRACKING -> renderTracking()
            Tab.DEVICES -> selectedDevice?.let { renderDeviceDetail(it) } ?: renderDevices()
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
                    meta = if (vehicle.isLocal) "LOCAL" else vehicle.licensePlate ?: "Vehicle",
                    detail = "Odometer ${vehicle.odometer?.toLong() ?: 0} km",
                    onClick = {
                        currentTab = Tab.RECORDS
                        selectedVehicle = vehicle
                        buildShell()
                        render()
                    }
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

        content.addView(sectionTitle("Pending Sync", "saved on this phone until Movara is reachable"))
        content.addView(queuePanel())
    }

    private fun renderVehicles() {
        content.addView(screenHeader("Vehicles", "Fleet, odometer, fuel, records, and trips.", null, null))
        content.addView(actionRow(
            "Add vehicle" to { showCreateVehicleDialog() },
            "Sync" to { syncAll() }
        ))
        if (vehicles.isEmpty()) {
            content.addView(emptyState("No vehicles yet. Add one here, or pull down to refresh from Movara."))
        } else {
            vehicles.forEach { vehicle ->
                val vehicleFuel = fuelRecords.filter { it.vehicleId == vehicle.id }
                val vehicleRecords = records.filter { it.vehicleId == vehicle.id }
                val vehicleTrips = trips.filter { it.vehicleId == vehicle.id }
                val detail = listOf(
                    "Odometer ${vehicle.odometer?.toLong() ?: 0} km",
                    "${vehicleFuel.size} fuel",
                    "${vehicleRecords.size} records",
                    "${vehicleTrips.size} trips"
                ).joinToString(" / ")
                content.addView(dataRow(
                    marker = "V",
                    title = vehicle.name,
                    meta = if (vehicle.isLocal) "LOCAL" else vehicle.licensePlate ?: "SYNCED",
                    detail = detail,
                    accent = if (vehicle.isLocal) COLOR_FUEL else COLOR_PRIMARY,
                    onClick = {
                        selectedVehicle = vehicle
                        vehicleSection = VehicleSection.OVERVIEW
                        render()
                    }
                ))
            }
        }
    }

    private fun renderVehicleDetail(vehicle: Vehicle) {
        val vehicleFuel = fuelRecords.filter { it.vehicleId == vehicle.id }.filterDateRange { it.date }
        val vehicleRecords = records.filter { it.vehicleId == vehicle.id }.filterDateRange { it.date }
        val vehicleTrips = trips.filter { it.vehicleId == vehicle.id }.filterDateRange { it.startTime }
        val localDrafts = store.drafts().filter { it.vehicleId == vehicle.id }
        content.addView(secondaryButton("Back to vehicles") {
            selectedVehicle = null
            render()
        })
        content.addView(screenHeader(vehicle.name, if (vehicle.isLocal) "Local until synced" else vehicle.licensePlate ?: "Vehicle", null, null))
        content.addView(panel {
            addView(statsStrip(listOf(
                "Odometer" to "${vehicle.odometer?.toLong() ?: 0} km",
                "Fuel" to vehicleFuel.size.toString(),
                "Records" to (vehicleRecords.size + localDrafts.size).toString(),
                "Trips" to vehicleTrips.size.toString()
            )))
            addView(actionRow(
                "Add record" to { showRecordDialog(vehicle, fuelMode = false) },
                "Add fuel" to { showRecordDialog(vehicle, fuelMode = true) }
            ))
        })
        content.addView(vehicleSectionDock())
        content.addView(dateRangePanel())

        when (vehicleSection) {
            VehicleSection.OVERVIEW -> {
                content.addView(sectionTitle("Fuel Summary", "calculated from selected range"))
                content.addView(fuelAnalyticsPanel(vehicleFuel))
                content.addView(sectionTitle("Recent Trips", "${vehicleTrips.size} trips"))
                vehicleTrips.take(6).forEach { trip ->
                    content.addView(tripTimelineRow(trip) { showTripDetail(trip) })
                }
                if (vehicleTrips.isEmpty()) content.addView(emptyState("No trips in this range."))
            }
            VehicleSection.FUEL -> {
                content.addView(sectionTitle("Fuel", "${vehicleFuel.size} fill-ups"))
                content.addView(fuelAnalyticsPanel(vehicleFuel))
                vehicleFuel.sortedByDescending { it.date }.forEach { fuel ->
                    content.addView(dataRow(
                        "F",
                        "Fuel fill-up",
                        fuel.date.take(10),
                        fuelRecordDetail(fuel, vehicleFuel),
                        COLOR_FUEL
                    ))
                }
            }
            VehicleSection.RECORDS -> {
                content.addView(sectionTitle("Records", "${vehicleRecords.size + localDrafts.size} records"))
                localDrafts.forEach { draft ->
                    content.addView(dataRow(
                        marker = if (draft.syncKind == "fuel") "F" else "R",
                        title = draft.title,
                        meta = "LOCAL",
                        detail = "${draft.date} / ${draft.type}${draft.lastError?.let { "\n$it" } ?: ""}",
                        accent = COLOR_FUEL
                    ))
                }
                vehicleRecords.sortedByDescending { it.date }.forEach { record ->
                    val detail = listOfNotNull(record.date, record.odometer?.let { "odo ${it.toLong()} km" }, record.amount?.let { "amount ${format1(it)}" }, record.notes).joinToString("\n")
                    content.addView(dataRow(recordMarker(record), record.title, record.type, detail, recordColor(record)))
                }
            }
            VehicleSection.TRIPS -> {
                content.addView(sectionTitle("Trips", "${vehicleTrips.size} trips"))
                vehicleTrips.forEach { trip ->
                    content.addView(tripTimelineRow(trip) { showTripDetail(trip) })
                }
                if (vehicleTrips.isEmpty()) content.addView(emptyState("No trips in this range."))
            }
        }
    }

    private fun renderRecords() {
        content.addView(screenHeader("Records", "Fuel, service, documents, expenses, and local drafts.", null, null))
        content.addView(recordComposer())
        content.addView(recordFilterDock())

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

        val filteredFuel = if (recordFilter == RecordFilter.ALL || recordFilter == RecordFilter.FUEL) fuelRecords else emptyList()
        val filteredRecords = records.filter { record ->
            when (recordFilter) {
                RecordFilter.ALL -> true
                RecordFilter.FUEL -> false
                RecordFilter.MAINTENANCE -> record.type == "maintenance"
                RecordFilter.DOCUMENTS -> record.type == "document" || record.subtype?.contains("insurance", true) == true || record.subtype?.contains("registration", true) == true
                RecordFilter.EXPENSES -> record.type == "expense" || record.type == "subscription" || record.type == "accessory"
            }
        }

        if (recordFilter == RecordFilter.ALL || recordFilter == RecordFilter.FUEL) {
            content.addView(sectionTitle("Fuel Analytics", "${fuelRecords.size} fill-ups loaded"))
            content.addView(fuelAnalyticsPanel(fuelRecords))
        }

        if (filteredFuel.isEmpty() && filteredRecords.isEmpty()) {
            content.addView(emptyState("No stored records loaded yet."))
        } else {
            if (filteredFuel.isNotEmpty()) {
                content.addView(sectionTitle("Fuel Records", "${filteredFuel.size} fill-ups"))
            }
            filteredFuel.forEach { fuel ->
                val detail = listOf(
                    fuel.date,
                    "${format1(fuel.fuelQuantity)} L",
                    fuel.fuelCost?.let { "cost ${format1(it)}" }.orEmpty(),
                    "odo ${fuel.odometer.toLong()} km"
                ).filter { it.isNotBlank() }.joinToString(" / ")
                content.addView(dataRow("F", "Fuel fill-up", fuel.vehicleName ?: "Fuel", detail, COLOR_FUEL))
            }

            filteredRecords.groupBy { recordGroupTitle(it) }.toSortedMap().forEach { (group, groupRecords) ->
                content.addView(sectionTitle(group, "${groupRecords.size} records"))
                groupRecords.sortedByDescending { it.date }.forEach { record ->
                    val numbers = listOfNotNull(
                        record.odometer?.let { "odo ${it.toLong()} km" },
                        record.amount?.let { "amount ${format1(it)}" }
                    ).joinToString(" / ")
                    val detail = listOf(record.date, "${record.type}/${record.subtype ?: "other"}", numbers, record.notes.orEmpty())
                        .filter { it.isNotBlank() }
                        .joinToString("\n")
                    content.addView(dataRow(recordMarker(record), record.title, record.vehicleName ?: record.type, detail, recordColor(record)))
                }
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

    private fun showCreateVehicleDialog() {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(8), dp(20), 0)
        }
        val nameInput = input("Vehicle name")
        val plateInput = input("License plate")
        val odometerInput = input("Odometer").apply { inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL }
        layout.addView(caption("Name"))
        layout.addView(nameInput)
        layout.addView(caption("License plate"))
        layout.addView(plateInput)
        layout.addView(caption("Odometer"))
        layout.addView(odometerInput)
        AlertDialog.Builder(this)
            .setTitle("Add vehicle")
            .setView(layout)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Save") { _, _ ->
                val name = nameInput.text.toString().trim()
                if (name.isBlank()) {
                    toast("Enter a vehicle name.")
                    return@setPositiveButton
                }
                val vehicle = store.addVehicleDraft(
                    name = name,
                    licensePlate = plateInput.text.toString().trim().ifBlank { null },
                    odometer = odometerInput.text.toString().toDoubleOrNull()
                )
                vehicles = store.vehicles()
                selectedVehicle = vehicle
                render()
                toast("Vehicle saved locally.")
            }
            .show()
    }

    private fun showRecordDialog(vehicle: Vehicle, fuelMode: Boolean) {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(8), dp(20), 0)
        }
        val titleInput = input(if (fuelMode) "Fuel fill-up" else "Title, e.g. Oil service")
        val dateInput = input("YYYY-MM-DD").apply {
            setText(today())
            inputType = InputType.TYPE_CLASS_DATETIME
        }
        val odometerInput = input("Odometer").apply { inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL }
        val quantityInput = input("Fuel quantity").apply { inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL }
        val amountInput = input(if (fuelMode) "Fuel cost" else "Amount").apply { inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL }
        val notesInput = input("Notes")
        layout.addView(caption("Title"))
        layout.addView(titleInput)
        layout.addView(caption("Date"))
        layout.addView(dateInput)
        layout.addView(caption("Odometer"))
        layout.addView(odometerInput)
        if (fuelMode) {
            layout.addView(caption("Fuel quantity"))
            layout.addView(quantityInput)
        }
        layout.addView(caption(if (fuelMode) "Fuel cost" else "Amount"))
        layout.addView(amountInput)
        layout.addView(caption("Notes"))
        layout.addView(notesInput)
        AlertDialog.Builder(this)
            .setTitle(if (fuelMode) "Add fuel" else "Add record")
            .setView(layout)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Save") { _, _ ->
                val cleanTitle = titleInput.text.toString().trim().ifBlank { if (fuelMode) "Fuel fill-up" else "" }
                val cleanDate = dateInput.text.toString().trim()
                val odo = odometerInput.text.toString().toDoubleOrNull()
                val quantity = quantityInput.text.toString().toDoubleOrNull()
                if (cleanTitle.isBlank()) {
                    toast("Enter a title.")
                    return@setPositiveButton
                }
                if (!isValidDate(cleanDate)) {
                    toast("Enter date as YYYY-MM-DD.")
                    return@setPositiveButton
                }
                if (fuelMode && (odo == null || quantity == null || quantity <= 0.0)) {
                    toast("Fuel needs odometer and quantity.")
                    return@setPositiveButton
                }
                store.addDraft(
                    syncKind = if (fuelMode) "fuel" else "vehicle_record",
                    vehicle = vehicle,
                    type = if (fuelMode) "expense" else "maintenance",
                    subtype = if (fuelMode) "custom" else "service",
                    title = cleanTitle,
                    date = cleanDate,
                    odometer = odo,
                    amount = amountInput.text.toString().toDoubleOrNull(),
                    fuelQuantity = quantity,
                    notes = notesInput.text.toString().trim().ifBlank { null }
                )
                render()
                toast("Saved locally.")
            }
            .show()
    }

    private fun recordFilterDock(): HorizontalScrollView {
        val strip = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            RecordFilter.values().forEach { filter ->
                val count = when (filter) {
                    RecordFilter.ALL -> records.size + fuelRecords.size
                    RecordFilter.FUEL -> fuelRecords.size
                    RecordFilter.MAINTENANCE -> records.count { it.type == "maintenance" }
                    RecordFilter.DOCUMENTS -> records.count { it.type == "document" || it.subtype?.contains("insurance", true) == true || it.subtype?.contains("registration", true) == true }
                    RecordFilter.EXPENSES -> records.count { it.type == "expense" || it.type == "subscription" || it.type == "accessory" }
                }
                addView(filterPill("${filter.label} $count", filter == recordFilter) {
                    recordFilter = filter
                    render()
                })
            }
        }
        return HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(strip)
            layoutParams = blockParams(bottom = 8)
        }
    }

    private fun vehicleSectionDock(): HorizontalScrollView {
        val strip = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            VehicleSection.values().forEach { section ->
                addView(filterPill(section.label, section == vehicleSection) {
                    vehicleSection = section
                    render()
                })
            }
        }
        return HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(strip)
            layoutParams = blockParams(bottom = 8)
        }
    }

    private fun dateRangePanel(): LinearLayout {
        return panel {
            addView(panelHeader("Range", "Leave blank for all dates. Calculations follow this selection."))
            val row = LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                val fromInput = input("From").apply {
                    setText(vehicleDateFrom)
                    inputType = InputType.TYPE_CLASS_DATETIME
                }
                val toInput = input("To").apply {
                    setText(vehicleDateTo)
                    inputType = InputType.TYPE_CLASS_DATETIME
                }
                addView(fromInput, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                addView(toInput, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { setMargins(dp(8), 0, 0, 0) })
                addView(secondaryButton("Apply") {
                    vehicleDateFrom = fromInput.text.toString().trim()
                    vehicleDateTo = toInput.text.toString().trim()
                    render()
                }, LinearLayout.LayoutParams(0, dp(48), 1f).apply { setMargins(dp(8), 0, 0, 0) })
            }
            addView(row)
        }
    }

    private fun fuelAnalyticsPanel(items: List<FuelRecord>): LinearLayout {
        return panel {
            if (items.isEmpty()) {
                addView(emptyState("Fuel records will show totals and efficiency after refresh."))
                return@panel
            }
            val sorted = items.sortedBy { it.odometer }
            val totalFuel = items.sumOf { it.fuelQuantity }
            val totalCost = items.mapNotNull { it.fuelCost }.sum()
            val avgRate = if (totalFuel > 0 && totalCost > 0) totalCost / totalFuel else null
            val distance = (sorted.lastOrNull()?.odometer ?: 0.0) - (sorted.firstOrNull()?.odometer ?: 0.0)
            val economy = if (totalFuel > 0 && distance > 0) distance / totalFuel else null
            addView(statsStrip(listOf(
                "Fuel" to "${format1(totalFuel)} L",
                "Cost" to if (totalCost > 0) format1(totalCost) else "-",
                "Rate" to (avgRate?.let { format1(it) } ?: "-"),
                "Economy" to (economy?.let { "${format1(it)} km/L" } ?: "-")
            )))
            addView(fuelBarGraph(items.take(8)))
        }
    }

    private fun fuelBarGraph(items: List<FuelRecord>): LinearLayout {
        val maxFuel = items.maxOfOrNull { it.fuelQuantity }?.takeIf { it > 0 } ?: 1.0
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.BOTTOM
            setPadding(0, dp(8), 0, 0)
            items.reversed().forEach { fuel ->
                val wrap = LinearLayout(this@MainActivity).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
                    addView(View(this@MainActivity).apply {
                        background = rounded(COLOR_FUEL, 0, 8)
                    }, LinearLayout.LayoutParams(dp(18), dp((36 + (fuel.fuelQuantity / maxFuel * 70)).toInt())))
                    addView(TextView(this@MainActivity).apply {
                        text = fuel.date.take(5)
                        textSize = 10f
                        gravity = Gravity.CENTER
                        setTextColor(COLOR_MUTED)
                    })
                }
                addView(wrap, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            }
        }
    }

    private fun fuelRecordDetail(fuel: FuelRecord, all: List<FuelRecord>): String {
        val previous = all
            .filter { it.odometer < fuel.odometer }
            .maxByOrNull { it.odometer }
        val runKm = previous?.let { fuel.odometer - it.odometer }?.takeIf { it > 0 }
        val economy = runKm?.let { if (fuel.fuelQuantity > 0) it / fuel.fuelQuantity else null }
        return listOf(
            "Odometer ${fuel.odometer.toLong()} km",
            runKm?.let { "Run ${format1(it)} km" } ?: "Run first fill",
            "Fuel ${format1(fuel.fuelQuantity)} L",
            "Cost ${fuel.fuelCost?.let { format1(it) } ?: "-"}",
            "Rate ${fuel.fuelRate?.let { format1(it) } ?: "-"}",
            "Economy ${economy?.let { "${format1(it)} km/L" } ?: "-"}"
        ).joinToString("\n")
    }

    private fun renderTracking() {
        content.addView(screenHeader("Tracker", "OsmAnd / Traccar Client style phone tracker.", null, null))
        content.addView(panel {
            addView(panelHeader("Phone Tracker", settings.osmandEndpointUrlSafe()))
            addView(statsStrip(listOf(
                "State" to if (settings.trackerActive) "active" else "stopped",
                "Type" to "osmand",
                "ID" to (settings.trackingDeviceId ?: "phone")
            )))
            addView(statsStrip(listOf(
                "Interval" to "${settings.trackingIntervalSeconds}s",
                "Move" to "${settings.trackingDistanceMeters}m",
                "Queued" to store.queuedPositionCount().toString(),
                "Permission" to if (hasLocationPermission()) "ready" else "needed"
            )))
            addView(actionRow(
                "Configure" to { showTrackingConfigDialog() },
                if (settings.trackerActive) "Stop" to { stopContinuousTracking() } else "Start" to { startContinuousTracking() }
            ))
            addView(secondaryButton("Send one point") { sendCurrentLocation() })
        })

        content.addView(sectionTitle("Queued GPS", "points waiting for upload"))
        val queued = store.queuedPositions(8)
        if (queued.isEmpty()) {
            content.addView(emptyState("No queued GPS points. Pull down to sync when online."))
        } else {
            queued.forEach { point ->
                content.addView(dataRow(
                    marker = "GPS",
                    title = point.deviceLabel,
                    meta = point.timestamp.replace('T', ' ').take(16),
                    detail = "${formatCoord(point.latitude)}, ${formatCoord(point.longitude)}\nSpeed ${point.speed?.let { format1(it) } ?: "-"} km/h${point.lastError?.let { "\n$it" } ?: ""}",
                    accent = if (point.lastError == null) COLOR_ACCENT else 0xffb91c1c.toInt()
                ))
            }
        }

        content.addView(sectionTitle("Device Monitor", "manual position check like Movara web"))
        if (devices.isEmpty()) {
            content.addView(emptyState("No devices loaded. Pull down to refresh from Movara."))
        } else {
            devices.forEach { device ->
                content.addView(deviceRow(device) { showDeviceDetail(device) })
            }
        }

        content.addView(sectionTitle("Battery", "foreground service behavior"))
        content.addView(panel {
            addView(panelHeader("Background Tracker", "Uses a persistent notification while active. If Android pauses it, exclude Movara from battery optimization in system settings."))
        })
    }

    private fun showTrackingConfigDialog() {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(8), dp(20), 0)
        }
        val endpointInput = input("http://server:5055").apply { setText(settings.osmandEndpointUrlSafe()) }
        val idInput = input("Device id").apply { setText(settings.trackingDeviceId ?: android.os.Build.MODEL ?: "phone") }
        val intervalInput = input("Interval seconds").apply {
            setText(settings.trackingIntervalSeconds.toString())
            inputType = InputType.TYPE_CLASS_NUMBER
        }
        val distanceInput = input("Minimum distance meters").apply {
            setText(settings.trackingDistanceMeters.toString())
            inputType = InputType.TYPE_CLASS_NUMBER
        }
        layout.addView(caption("Protocol"))
        layout.addView(smallText("osmand"))
        layout.addView(caption("OsmAnd endpoint"))
        layout.addView(endpointInput)
        layout.addView(caption("Device id"))
        layout.addView(idInput)
        layout.addView(caption("Interval"))
        layout.addView(intervalInput)
        layout.addView(caption("Distance"))
        layout.addView(distanceInput)
        AlertDialog.Builder(this)
            .setTitle("Tracker config")
            .setView(layout)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Save") { _, _ ->
                settings.osmandEndpoint = endpointInput.text.toString().trim().ifBlank { null }
                settings.trackingDeviceId = idInput.text.toString().trim().ifBlank { android.os.Build.MODEL ?: "phone" }
                settings.trackingIntervalSeconds = intervalInput.text.toString().toIntOrNull() ?: 30
                settings.trackingDistanceMeters = distanceInput.text.toString().toIntOrNull() ?: 25
                render()
                toast("Tracker config saved.")
            }
            .show()
    }

    private fun renderDevices() {
        content.addView(screenHeader("Devices", "Trackers connected to Movara.", null, null))
        if (devices.isEmpty()) {
            content.addView(emptyState("No devices loaded yet."))
        } else {
            content.addView(statsStrip(listOf(
                "Total" to devices.size.toString(),
                "Online" to devices.count { it.status.equals("online", true) }.toString(),
                "Offline" to devices.count { !it.status.equals("online", true) }.toString()
            )))
            devices.forEach { device ->
                content.addView(deviceRow(device) { showDeviceDetail(device) })
            }
        }
    }

    private fun showDeviceDetail(device: Device) {
        selectedDevice = device
        selectedDevicePositions = emptyList()
        render()
        runBackground(
            work = { api.fetchLatestPositions(device.id) },
            done = { positions ->
                selectedDevicePositions = positions
                render()
            }
        )
    }

    private fun renderDeviceDetail(device: Device) {
        content.addView(secondaryButton("Back to devices") {
            selectedDevice = null
            selectedDevicePositions = emptyList()
            render()
        })
        content.addView(screenHeader(device.name ?: "Device", device.imei, null, null))
        content.addView(panel {
            addView(panelHeader("Status", "${device.status.uppercase(Locale.US)} / ${device.protocol}"))
            addView(statsStrip(listOf(
                "Status" to device.status,
                "Protocol" to device.protocol,
                "Points" to selectedDevicePositions.size.toString()
            )))
            addView(keyValueRow("IMEI", device.imei))
            addView(keyValueRow("Last packet", device.lastSeen ?: "never"))
            addView(keyValueRow("Live source", preferredLivePacketLabel(device.protocol)))
            addView(keyValueRow("Linked vehicle", vehicles.find { vehicle -> trips.any { it.vehicleId == vehicle.id && it.deviceName == (device.name ?: device.imei) } }?.name ?: "-"))
        })
        content.addView(sectionTitle("Latest Positions", "recent points from Movara"))
        if (selectedDevicePositions.isEmpty()) {
            content.addView(emptyState("No latest positions loaded. Pull down to refresh this device."))
        } else {
            content.addView(mapPanel(selectedDevicePositions))
            selectedDevicePositions.forEach { position ->
                content.addView(dataRow(
                    marker = "P",
                    title = position.timestamp.replace('T', ' ').take(16),
                    meta = "${position.speed?.let { format1(it) } ?: "-"} km/h",
                    detail = "${formatCoord(position.latitude)}, ${formatCoord(position.longitude)}",
                    accent = COLOR_ACCENT
                ))
            }
        }
    }

    private fun renderTrips() {
        content.addView(screenHeader("Trips", "Full trip history, maps, stops, and fuel context.", null, null))
        content.addView(actionRow(
            "Add trip" to { showCreateTripDialog() },
            "Sync" to { syncAll() }
        ))
        val visibleTrips = trips.filter { trip ->
            when (tripFilter) {
                TripFilter.ALL -> true
                TripFilter.FAVORITES -> trip.favorite
                TripFilter.DEVICE -> trip.source == "device"
                TripFilter.MANUAL -> trip.source != "device"
            }
        }
        if (trips.isEmpty()) {
            content.addView(emptyState("No trips loaded yet."))
        } else {
            content.addView(statsStrip(listOf(
                "Trips" to trips.size.toString(),
                "Favorites" to trips.count { it.favorite }.toString(),
                "Vehicles" to trips.mapNotNull { it.vehicleId }.distinct().size.toString()
            )))
            content.addView(tripFilterDock())
            var lastBucket = ""
            visibleTrips.forEach { trip ->
                val bucket = trip.startTime.replace('T', ' ').take(10)
                if (bucket != lastBucket) {
                    content.addView(dateDivider(bucket))
                    lastBucket = bucket
                }
                content.addView(tripTimelineRow(trip) {
                    showTripDetail(trip)
                })
            }
            if (visibleTrips.isEmpty()) content.addView(emptyState("No trips match this filter."))
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

    private fun showCreateTripDialog() {
        if (devices.isEmpty()) {
            toast("Refresh devices before creating a trip.")
            return
        }
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(8), dp(20), 0)
        }
        val deviceSpinner = spinner(devices.map { it.name ?: it.imei })
        val vehicleSpinner = spinner(listOf("No vehicle") + vehicles.filter { !it.isLocal }.map { it.name })
        val nameInput = input("Trip name")
        val startInput = input("Start ISO time")
        val endInput = input("End ISO time")
        val favoriteSpinner = spinner(listOf("Normal", "Favorite"))
        layout.addView(caption("Device"))
        layout.addView(deviceSpinner)
        layout.addView(caption("Vehicle"))
        layout.addView(vehicleSpinner)
        layout.addView(caption("Name"))
        layout.addView(nameInput)
        layout.addView(caption("Start time"))
        layout.addView(startInput)
        layout.addView(caption("End time"))
        layout.addView(endInput)
        layout.addView(caption("Favorite"))
        layout.addView(favoriteSpinner)
        AlertDialog.Builder(this)
            .setTitle("Add trip")
            .setView(layout)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Create") { _, _ ->
                val device = devices.getOrNull(deviceSpinner.selectedItemPosition) ?: return@setPositiveButton
                val vehicle = vehicles.filter { !it.isLocal }.getOrNull(vehicleSpinner.selectedItemPosition - 1)
                val start = startInput.text.toString().trim()
                val end = endInput.text.toString().trim()
                if (start.isBlank() || end.isBlank()) {
                    toast("Enter start and end ISO times.")
                    return@setPositiveButton
                }
                runBackground(
                    work = {
                        api.createTrip(
                            deviceId = device.id,
                            vehicleId = vehicle?.id,
                            name = nameInput.text.toString().trim().ifBlank { null },
                            startTime = start,
                            endTime = end,
                            favorite = favoriteSpinner.selectedItemPosition == 1
                        )
                    },
                    done = { trip ->
                        trips = listOf(trip) + trips
                        render()
                        toast("Trip created.")
                    }
                )
            }
            .show()
    }

    private fun toggleTripFavorite(trip: Trip) {
        runBackground(
            work = {
                api.updateTripFavorite(trip.id, !trip.favorite)
                api.fetchTripDetail(trip.id)
            },
            done = { detail ->
                trips = trips.map { item -> if (item.id == trip.id) item.copy(favorite = !trip.favorite) else item }
                selectedTripDetail = detail.copy(
                    stops = if (detail.stops.isEmpty()) detectStops(detail.positions) else detail.stops,
                    fuelStops = fuelRecords.filter { fuel ->
                        fuel.vehicleId == detail.trip.vehicleId && within(fuel.date, detail.trip.startTime, detail.trip.endTime)
                    }
                )
                render()
                toast(if (!trip.favorite) "Trip marked favorite." else "Trip removed from favorites.")
            }
        )
    }

    private fun renderTripDetail(detail: TripDetail) {
        content.addView(secondaryButton("Back to trips") {
            selectedTripDetail = null
            render()
        })
        content.addView(screenHeader(detail.trip.label, detail.trip.vehicleName ?: detail.trip.deviceName ?: detail.trip.source, null, null))
        content.addView(secondaryButton(if (detail.trip.favorite) "Remove favorite" else "Mark favorite") {
            toggleTripFavorite(detail.trip)
        })
        content.addView(mapPanel(detail.positions))
        val stats = detail.stats
        content.addView(panel {
            addView(panelHeader("Trip Window", compactRange(detail.trip.startTime, detail.trip.endTime)))
            addView(statsStrip(listOf(
                "Stops" to detail.stops.size.toString(),
                "Fuel" to detail.fuelStops.size.toString(),
                "Points" to detail.positions.size.toString()
            )))
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

    private fun syncAll() {
        runBackground(
            work = {
                val vehicleDrafts = store.draftVehicles().sortedBy { it.createdAt }
                var vehicleSynced = 0
                var vehicleFailed = 0
                vehicleDrafts.forEach { draft ->
                    try {
                        val remote = api.createVehicle(draft)
                        store.updateDraftVehicleReference(draft.localId, remote)
                        vehicleSynced += 1
                    } catch (error: Exception) {
                        store.markDraftVehicleError(draft.localId, error.message ?: "Vehicle sync failed")
                        vehicleFailed += 1
                    }
                }
                val recordResult = syncDraftsInternal()
                val gpsResult = TrackingSync.flush(store, api)
                SyncAllResult(vehicleDrafts.size, vehicleSynced, vehicleFailed, recordResult, gpsResult)
            },
            done = { result ->
                refreshAfterSync(result)
            }
        )
    }

    private fun refreshAfterSync(result: SyncAllResult) {
        runBackground(
            work = {
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
                vehicles = store.vehicles()
                devices = it.devices
                trips = it.trips
                records = it.records
                fuelRecords = it.fuelRecords
                selectedVehicle = selectedVehicle?.let { current ->
                    vehicles.find { it.id == current.id }
                        ?: vehicles.find { it.name == current.name && it.licensePlate == current.licensePlate }
                }
                render()
                toast("Sync: vehicles ${result.vehicleSynced}/${result.vehicleAttempted}, records ${result.records.synced}/${result.records.attempted}, GPS ${result.gps.synced}/${result.gps.attempted}.")
            }
        )
    }

    private fun refreshCurrentTab() {
        when (currentTab) {
            Tab.HOME -> refreshAll()
            Tab.RECORDS -> refreshAll()
            Tab.TRACKING -> syncAll()
            Tab.DEVICES -> selectedDevice?.let { device ->
                runBackground(
                    work = { api.fetchLatestPositions(device.id) },
                    done = {
                        selectedDevicePositions = it
                        render()
                        toast("Device positions refreshed.")
                    }
                )
            } ?: refreshDevices()
            Tab.TRIPS -> selectedTripDetail?.let { showTripDetail(it.trip) } ?: refreshTrips()
        }
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
            work = { syncDraftsInternal() },
            done = { result ->
                render()
                toast("Sync: ${result.synced}/${result.attempted} sent, ${result.failed} failed.")
            }
        )
    }

    private fun syncDraftsInternal(): SyncResult {
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
        return SyncResult(drafts.size, synced, failed)
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
                    deviceLabel = settings.trackingDeviceId?.takeIf { it.isNotBlank() } ?: (android.os.Build.MODEL ?: "phone"),
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
        settings.trackerActive = true
        toast("Tracker started.")
        render()
    }

    private fun stopContinuousTracking() {
        stopService(Intent(this, TrackingService::class.java))
        settings.trackerActive = false
        toast("Tracker stopped.")
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
            .setMessage("Local changes work without a server. Login is needed for refresh, sync, trips, devices, and tracker upload.")
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
        val pending = store.draftVehicles().size + store.drafts().size + store.queuedPositionCount()
        return "$server\n$session - ${vehicles.size} vehicles - $pending local items pending"
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
            addView(pillButton("Sync", COLOR_ACCENT) { syncAll() })
            addView(pillButton("Start tracker", COLOR_INK) { startContinuousTracking() })
        }
        return HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(strip)
            layoutParams = blockParams(bottom = 14)
        }
    }

    private fun queuePanel(): LinearLayout {
        return panel {
            val localVehicles = store.draftVehicles().size
            val localRecords = store.drafts().size
            val localGps = store.queuedPositionCount()
            addView(panelHeader("Local Changes", "These items are usable now and will be sent on Sync."))
            addView(statsStrip(listOf(
                "Vehicles" to localVehicles.toString(),
                "Records" to localRecords.toString(),
                "GPS" to localGps.toString()
            )))
            addView(smallText(connectionSummary()))
            addView(actionRow(
                "Sync" to { syncAll() },
                "Refresh" to { refreshAll() }
            ))
        }
    }

    private fun screenHeader(title: String, subtitle: String, actionLabel: String?, action: (() -> Unit)?): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(4), 0, dp(12))
            val copy = LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.VERTICAL
                addView(TextView(this@MainActivity).apply {
                    text = title
                    textSize = 22f
                    setTextColor(COLOR_TEXT)
                })
                addView(TextView(this@MainActivity).apply {
                    text = subtitle
                    textSize = 12f
                    setTextColor(COLOR_MUTED)
                })
            }
            addView(copy)
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
                textSize = if (dark) 16f else 15f
                setTextColor(if (dark) 0xffffffff.toInt() else COLOR_TEXT)
                gravity = Gravity.CENTER
            })
            addView(TextView(this@MainActivity).apply {
                text = label
                textSize = 10f
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

    private fun deviceRow(device: Device, onClick: () -> Unit): LinearLayout {
        val detail = listOf(
            "IMEI ${device.imei}",
            "Protocol ${device.protocol.uppercase(Locale.US)}",
            "Last packet ${device.lastSeen ?: "never"}",
            "Live source ${preferredLivePacketLabel(device.protocol)}"
        ).joinToString("\n")
        return dataRow(
            marker = device.status.take(1).uppercase(Locale.US).ifBlank { "D" },
            title = device.name ?: "Unnamed device",
            meta = device.status.uppercase(Locale.US),
            detail = detail,
            accent = statusColor(device.status),
            onClick = onClick
        )
    }

    private fun keyValueRow(label: String, value: String): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(4), 0, dp(4))
            addView(TextView(this@MainActivity).apply {
                text = label
                textSize = 11f
                setTextColor(COLOR_MUTED)
            })
            addView(TextView(this@MainActivity).apply {
                text = value
                textSize = 13f
                setTextColor(COLOR_TEXT)
            })
        }
    }

    private fun preferredLivePacketLabel(protocol: String): String {
        return when (protocol.lowercase(Locale.US)) {
            "gt06" -> "0x13 Status"
            "eelink" -> "0x07 Status"
            "osmand" -> "HTTP location"
            else -> "Latest attributes"
        }
    }

    private fun tripTimelineRow(trip: Trip, onClick: () -> Unit): LinearLayout {
        val marker = if (trip.favorite) "*" else "T"
        return dataRow(
            marker = marker,
            title = trip.label,
            meta = trip.source.uppercase(Locale.US),
            detail = "${trip.vehicleName ?: trip.deviceName ?: "Unknown vehicle"}\n${compactRange(trip.startTime, trip.endTime)}",
            accent = if (trip.favorite) COLOR_FUEL else COLOR_ACCENT,
            onClick = onClick
        )
    }

    private fun tripFilterDock(): HorizontalScrollView {
        val strip = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            TripFilter.values().forEach { filter ->
                val count = trips.count { trip ->
                    when (filter) {
                        TripFilter.ALL -> true
                        TripFilter.FAVORITES -> trip.favorite
                        TripFilter.DEVICE -> trip.source == "device"
                        TripFilter.MANUAL -> trip.source != "device"
                    }
                }
                addView(filterPill("${filter.label} $count", filter == tripFilter) {
                    tripFilter = filter
                    render()
                })
            }
        }
        return HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(strip)
            layoutParams = blockParams(bottom = 8)
        }
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

    private fun filterPill(text: String, selected: Boolean, onClick: () -> Unit): TextView {
        return TextView(this).apply {
            this.text = text
            textSize = 13f
            gravity = Gravity.CENTER
            setTextColor(if (selected) 0xffffffff.toInt() else COLOR_TEXT)
            setPadding(dp(14), 0, dp(14), 0)
            background = rounded(if (selected) COLOR_INK else 0xffffffff.toInt(), if (selected) 0 else COLOR_LINE, 18)
            setOnClickListener { onClick() }
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(38)).apply {
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

    private fun MovaraSettings.osmandEndpointUrlSafe(): String {
        return runCatching { osmandEndpointUrl() }.getOrElse { "Set server or endpoint" }
    }

    private fun <T> List<T>.filterDateRange(dateProvider: (T) -> String): List<T> {
        return filter { item ->
            val value = dateProvider(item).take(10)
            val fromOk = vehicleDateFrom.isBlank() || value >= vehicleDateFrom
            val toOk = vehicleDateTo.isBlank() || value <= vehicleDateTo
            fromOk && toOk
        }
    }

    private fun recordGroupTitle(record: VehicleRecord): String {
        return when {
            record.type == "maintenance" -> "Maintenance"
            record.type == "document" || record.subtype?.contains("insurance", true) == true || record.subtype?.contains("registration", true) == true -> "Documents"
            record.type == "subscription" -> "Subscriptions"
            record.type == "accessory" -> "Accessories"
            record.type == "expense" -> "Expenses"
            else -> record.type.replaceFirstChar { it.titlecase(Locale.US) }
        }
    }

    private fun recordMarker(record: VehicleRecord): String {
        return when (recordGroupTitle(record)) {
            "Maintenance" -> "M"
            "Documents" -> "D"
            "Subscriptions" -> "S"
            "Accessories" -> "A"
            "Expenses" -> "E"
            else -> "R"
        }
    }

    private fun recordColor(record: VehicleRecord): Int {
        return when (recordGroupTitle(record)) {
            "Maintenance" -> COLOR_PRIMARY
            "Documents" -> COLOR_ACCENT
            "Subscriptions" -> COLOR_FUEL
            "Accessories" -> 0xff7c3aed.toInt()
            "Expenses" -> 0xffbe123c.toInt()
            else -> COLOR_MUTED
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
                runOnUiThread {
                    if (::swipeRefresh.isInitialized) swipeRefresh.isRefreshing = false
                    done(result)
                }
            } catch (error: Exception) {
                runOnUiThread {
                    if (::swipeRefresh.isInitialized) swipeRefresh.isRefreshing = false
                    render()
                    toast(error.message ?: "Something went wrong.")
                }
            }
        }.start()
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

    private fun caption(text: String): TextView {
        return smallText(text).apply {
            setPadding(0, dp(8), 0, 0)
        }
    }

    private fun rowText(left: String, right: String): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(TextView(this@MainActivity).apply {
                text = left
                textSize = 15f
                setTextColor(COLOR_TEXT)
            })
            addView(TextView(this@MainActivity).apply {
                text = right
                textSize = 11f
                setTextColor(COLOR_MUTED)
            })
        }
    }

    private fun smallText(textValue: String): TextView {
        return TextView(this).apply {
            text = textValue
            textSize = 12f
            setTextColor(COLOR_MUTED)
        }
    }

    private fun emptyState(text: String): TextView {
        return smallText(text).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(20), 0, dp(20))
        }
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
        RECORDS("Vehicles"),
        TRACKING("Tracker"),
        DEVICES("Devices"),
        TRIPS("Trips")
    }

    private enum class VehicleSection(val label: String) {
        OVERVIEW("Overview"),
        FUEL("Fuel"),
        RECORDS("Records"),
        TRIPS("Trips")
    }

    private enum class RecordFilter(val label: String) {
        ALL("All"),
        FUEL("Fuel"),
        MAINTENANCE("Service"),
        DOCUMENTS("Docs"),
        EXPENSES("Costs")
    }

    private enum class TripFilter(val label: String) {
        ALL("All"),
        FAVORITES("Favorites"),
        DEVICE("Device"),
        MANUAL("Manual")
    }

    private data class RefreshBundle(
        val vehicles: List<Vehicle>,
        val devices: List<Device>,
        val trips: List<Trip>,
        val records: List<VehicleRecord>,
        val fuelRecords: List<FuelRecord>
    )

    private data class SyncAllResult(
        val vehicleAttempted: Int,
        val vehicleSynced: Int,
        val vehicleFailed: Int,
        val records: SyncResult,
        val gps: SyncResult
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
