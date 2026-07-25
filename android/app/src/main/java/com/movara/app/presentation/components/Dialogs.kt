package com.movara.app.presentation.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.movara.app.Device
import com.movara.app.FuelRecord
import com.movara.app.Trip
import com.movara.app.Vehicle
import com.movara.app.VehicleRecord
import com.movara.app.data.RecordDraftInput
import com.movara.app.data.settings.AppSettings
import java.time.Instant
import java.time.LocalDate
import java.time.temporal.ChronoUnit

@Composable
fun CreateVehicleDialog(
    onDismiss: () -> Unit,
    onSave: (String, String?, Double?) -> Unit,
) {
    var name by rememberSaveable { mutableStateOf("") }
    var plate by rememberSaveable { mutableStateOf("") }
    var odometer by rememberSaveable { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add vehicle") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text("Vehicle name") }, singleLine = true)
                OutlinedTextField(plate, { plate = it }, label = { Text("License plate") }, singleLine = true)
                OutlinedTextField(
                    odometer,
                    { odometer = it.decimalInput() },
                    label = { Text("Odometer") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
            }
        },
        confirmButton = {
            Button(onClick = {
                onSave(name, plate.ifBlank { null }, odometer.toDoubleOrNull())
                if (name.isNotBlank()) onDismiss()
            }) { Text("Save offline") }
        },
        dismissButton = { OutlinedButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
fun RecordDialog(
    vehicles: List<Vehicle>,
    initialVehicleId: String?,
    initialFuel: Boolean = false,
    onDismiss: () -> Unit,
    onSave: (RecordDraftInput) -> Unit,
) {
    var vehicleId by rememberSaveable(initialVehicleId) {
        mutableStateOf(initialVehicleId ?: vehicles.firstOrNull()?.id.orEmpty())
    }
    var fuel by rememberSaveable { mutableStateOf(initialFuel) }
    var type by rememberSaveable { mutableStateOf("maintenance") }
    var subtype by rememberSaveable { mutableStateOf("service") }
    var title by rememberSaveable { mutableStateOf("") }
    var date by rememberSaveable { mutableStateOf(LocalDate.now().toString()) }
    var odometer by rememberSaveable { mutableStateOf("") }
    var amount by rememberSaveable { mutableStateOf("") }
    var quantity by rememberSaveable { mutableStateOf("") }
    var notes by rememberSaveable { mutableStateOf("") }
    val vehicle = vehicles.firstOrNull { it.id == vehicleId }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (fuel) "Add fuel fill-up" else "Add vehicle record") },
        text = {
            Column(
                Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                SelectionField(
                    label = "Vehicle",
                    value = vehicle?.name ?: "Select a vehicle",
                    choices = vehicles.map { it.id to it.name },
                    onSelect = { vehicleId = it },
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column {
                        Text("Fuel fill-up", style = MaterialTheme.typography.titleMedium)
                        Text("Uses the dedicated fuel endpoint", style = MaterialTheme.typography.bodyMedium)
                    }
                    Switch(checked = fuel, onCheckedChange = { fuel = it })
                }
                if (!fuel) {
                    SelectionField(
                        "Type",
                        type,
                        listOf("maintenance", "document", "expense", "subscription", "accessory").map { it to it },
                        onSelect = { type = it },
                    )
                    SelectionField(
                        "Subtype",
                        subtype,
                        recordSubtypes.map { it to it.replace('_', ' ') },
                        onSelect = { subtype = it },
                    )
                }
                OutlinedTextField(
                    title,
                    { title = it },
                    label = { Text(if (fuel) "Title (optional)" else "Title") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    date,
                    { date = it.take(10) },
                    label = { Text("Date") },
                    placeholder = { Text("YYYY-MM-DD") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    odometer,
                    { odometer = it.decimalInput() },
                    label = { Text("Odometer") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                if (fuel) OutlinedTextField(
                    quantity,
                    { quantity = it.decimalInput() },
                    label = { Text("Fuel quantity") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                OutlinedTextField(
                    amount,
                    { amount = it.decimalInput() },
                    label = { Text(if (fuel) "Fuel cost" else "Amount") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                OutlinedTextField(
                    notes,
                    { notes = it },
                    label = { Text("Notes") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            Button(
                enabled = vehicle != null,
                onClick = {
                    vehicle?.let {
                        onSave(
                            RecordDraftInput(
                                vehicle = it,
                                fuel = fuel,
                                type = type,
                                subtype = subtype,
                                title = title,
                                date = date,
                                odometer = odometer.toDoubleOrNull(),
                                amount = amount.toDoubleOrNull(),
                                fuelQuantity = quantity.toDoubleOrNull(),
                                notes = notes,
                            )
                        )
                        onDismiss()
                    }
                },
            ) { Text("Save offline") }
        },
        dismissButton = { OutlinedButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
fun EditFuelDialog(
    record: FuelRecord,
    onDismiss: () -> Unit,
    onSave: (FuelRecord) -> Unit,
    onDelete: (FuelRecord) -> Unit,
) {
    var date by rememberSaveable(record.id) { mutableStateOf(record.date.take(10)) }
    var odometer by rememberSaveable(record.id) { mutableStateOf(record.odometer.toString()) }
    var quantity by rememberSaveable(record.id) { mutableStateOf(record.fuelQuantity.toString()) }
    var cost by rememberSaveable(record.id) { mutableStateOf(record.fuelCost?.toString().orEmpty()) }
    var rate by rememberSaveable(record.id) { mutableStateOf(record.fuelRate?.toString().orEmpty()) }
    var confirmDelete by rememberSaveable(record.id) { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit fuel record") },
        text = {
            Column(
                Modifier.heightIn(max = 500.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedTextField(date, { date = it.take(10) }, label = { Text("Date") }, singleLine = true)
                OutlinedTextField(
                    odometer, { odometer = it.decimalInput() }, label = { Text("Odometer") },
                    singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                OutlinedTextField(
                    quantity, { quantity = it.decimalInput() }, label = { Text("Fuel quantity") },
                    singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                OutlinedTextField(
                    cost, { cost = it.decimalInput() }, label = { Text("Fuel cost") },
                    singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                OutlinedTextField(
                    rate, { rate = it.decimalInput() }, label = { Text("Fuel rate") },
                    singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                OutlinedButton(
                    onClick = { confirmDelete = true },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Delete fuel record") }
            }
        },
        confirmButton = {
            Button(
                enabled = date.isDate() &&
                    (odometer.toDoubleOrNull()?.let { it >= 0 } == true) &&
                    (quantity.toDoubleOrNull()?.let { it > 0 } == true) &&
                    (cost.isBlank() || cost.toDoubleOrNull()?.let { it >= 0 } == true) &&
                    (rate.isBlank() || rate.toDoubleOrNull()?.let { it >= 0 } == true),
                onClick = {
                onSave(
                    record.copy(
                        date = date,
                        odometer = odometer.toDoubleOrNull() ?: -1.0,
                        fuelQuantity = quantity.toDoubleOrNull() ?: 0.0,
                        fuelCost = cost.toDoubleOrNull(),
                        fuelRate = rate.toDoubleOrNull(),
                    )
                )
                onDismiss()
                },
            ) { Text("Save") }
        },
        dismissButton = { OutlinedButton(onClick = onDismiss) { Text("Cancel") } },
    )
    if (confirmDelete) {
        ConfirmDeleteDialog(
            "Delete fuel record?",
            "This removes the fill-up from Movara and cannot be undone.",
            onDismiss = { confirmDelete = false },
            onDelete = { onDelete(record); onDismiss() },
        )
    }
}

@Composable
fun EditVehicleRecordDialog(
    record: VehicleRecord,
    onDismiss: () -> Unit,
    onSave: (VehicleRecord) -> Unit,
    onDelete: (VehicleRecord) -> Unit,
) {
    var type by rememberSaveable(record.id) { mutableStateOf(record.type) }
    var subtype by rememberSaveable(record.id) { mutableStateOf(record.subtype.orEmpty()) }
    var title by rememberSaveable(record.id) { mutableStateOf(record.title) }
    var date by rememberSaveable(record.id) { mutableStateOf(record.date.take(10)) }
    var odometer by rememberSaveable(record.id) { mutableStateOf(record.odometer?.toString().orEmpty()) }
    var amount by rememberSaveable(record.id) { mutableStateOf(record.amount?.toString().orEmpty()) }
    var notes by rememberSaveable(record.id) { mutableStateOf(record.notes.orEmpty()) }
    var confirmDelete by rememberSaveable(record.id) { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit vehicle record") },
        text = {
            Column(
                Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                SelectionField(
                    "Type", type,
                    listOf("maintenance", "document", "expense", "subscription", "accessory").map { it to it },
                    onSelect = { type = it },
                )
                SelectionField(
                    "Subtype",
                    subtype.replace('_', ' '),
                    recordSubtypes.map { it to it.replace('_', ' ') },
                    onSelect = { subtype = it },
                )
                OutlinedTextField(title, { title = it }, label = { Text("Title") }, singleLine = true)
                OutlinedTextField(date, { date = it.take(10) }, label = { Text("Date") }, singleLine = true)
                OutlinedTextField(
                    odometer, { odometer = it.decimalInput() }, label = { Text("Odometer") },
                    singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                OutlinedTextField(
                    amount, { amount = it.decimalInput() }, label = { Text("Amount") },
                    singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                OutlinedTextField(notes, { notes = it }, label = { Text("Notes") }, minLines = 2)
                OutlinedButton(
                    onClick = { confirmDelete = true },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Delete vehicle record") }
            }
        },
        confirmButton = {
            Button(
                enabled = title.isNotBlank() && date.isDate() &&
                    (odometer.isBlank() || odometer.toDoubleOrNull()?.let { it >= 0 } == true) &&
                    (amount.isBlank() || amount.toDoubleOrNull()?.let { it >= 0 } == true),
                onClick = {
                onSave(
                    record.copy(
                        type = type,
                        subtype = subtype.ifBlank { null },
                        title = title,
                        date = date,
                        odometer = odometer.toDoubleOrNull(),
                        amount = amount.toDoubleOrNull(),
                        notes = notes.ifBlank { null },
                    )
                )
                onDismiss()
                },
            ) { Text("Save") }
        },
        dismissButton = { OutlinedButton(onClick = onDismiss) { Text("Cancel") } },
    )
    if (confirmDelete) {
        ConfirmDeleteDialog(
            "Delete vehicle record?",
            "This removes the record from Movara and cannot be undone.",
            onDismiss = { confirmDelete = false },
            onDelete = { onDelete(record); onDismiss() },
        )
    }
}

@Composable
fun EditTripDialog(
    trip: Trip,
    onDismiss: () -> Unit,
    onSave: (String, String, String) -> Unit,
) {
    var name by rememberSaveable(trip.id) { mutableStateOf(trip.label) }
    var start by rememberSaveable(trip.id) { mutableStateOf(trip.startTime) }
    var end by rememberSaveable(trip.id) { mutableStateOf(trip.endTime) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit trip") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text("Name") })
                OutlinedTextField(start, { start = it }, label = { Text("Start (ISO-8601)") })
                OutlinedTextField(end, { end = it }, label = { Text("End (ISO-8601)") })
            }
        },
        confirmButton = {
            Button(
                enabled = name.isNotBlank() && start.isInstant() && end.isInstant() && start < end,
                onClick = { onSave(name, start, end); onDismiss() },
            ) { Text("Save") }
        },
        dismissButton = { OutlinedButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
fun SplitTripDialog(
    trip: Trip,
    onDismiss: () -> Unit,
    onSplit: (String) -> Unit,
) {
    val midpoint = remember(trip.id) {
        runCatching {
            val start = Instant.parse(trip.startTime)
            val end = Instant.parse(trip.endTime)
            start.plusMillis((end.toEpochMilli() - start.toEpochMilli()) / 2).toString()
        }.getOrDefault(trip.startTime)
    }
    var splitAt by rememberSaveable(trip.id) { mutableStateOf(midpoint) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Split trip") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Choose a time inside this trip. Movara will create two trips.")
                OutlinedTextField(
                    splitAt, { splitAt = it }, label = { Text("Split at (ISO-8601)") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            Button(
                enabled = splitAt.isInstant() && splitAt > trip.startTime && splitAt < trip.endTime,
                onClick = { onSplit(splitAt); onDismiss() },
            ) { Text("Split") }
        },
        dismissButton = { OutlinedButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
fun MergeTripDialog(
    trip: Trip,
    candidates: List<Trip>,
    onDismiss: () -> Unit,
    onMerge: (String) -> Unit,
) {
    var targetId by rememberSaveable(trip.id) { mutableStateOf(candidates.firstOrNull()?.id.orEmpty()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Merge trip") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Choose an adjacent compatible trip.")
                SelectionField(
                    "Target trip",
                    candidates.firstOrNull { it.id == targetId }?.label ?: "No compatible trip",
                    candidates.map { it.id to "${it.label} • ${it.startTime.take(16)}" },
                    onSelect = { targetId = it },
                )
            }
        },
        confirmButton = {
            Button(enabled = targetId.isNotBlank(), onClick = { onMerge(targetId); onDismiss() }) {
                Text("Merge")
            }
        },
        dismissButton = { OutlinedButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
fun ConfirmDeleteDialog(
    title: String,
    message: String,
    onDismiss: () -> Unit,
    onDelete: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(message) },
        confirmButton = { Button(onClick = { onDelete(); onDismiss() }) { Text("Delete") } },
        dismissButton = { OutlinedButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
fun TrackerSettingsDialog(
    settings: AppSettings,
    onDismiss: () -> Unit,
    onSave: (String, String, Int, Int) -> Unit,
) {
    var deviceId by rememberSaveable { mutableStateOf(settings.trackingDeviceId) }
    var endpoint by rememberSaveable { mutableStateOf(settings.osmandEndpoint) }
    var interval by rememberSaveable { mutableStateOf(settings.trackingIntervalSeconds.toString()) }
    var distance by rememberSaveable { mutableStateOf(settings.trackingDistanceMeters.toString()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Configure phone tracker") },
        text = {
            Column(
                Modifier.heightIn(max = 500.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedTextField(
                    deviceId, { deviceId = it }, label = { Text("Device label") },
                    modifier = Modifier.fillMaxWidth(), singleLine = true,
                )
                OutlinedTextField(
                    endpoint, { endpoint = it }, label = { Text("OsmAnd endpoint (optional)") },
                    modifier = Modifier.fillMaxWidth(), singleLine = true,
                )
                OutlinedTextField(
                    interval, { interval = it.filter(Char::isDigit) }, label = { Text("Interval (seconds)") },
                    modifier = Modifier.fillMaxWidth(), singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
                OutlinedTextField(
                    distance, { distance = it.filter(Char::isDigit) }, label = { Text("Distance (metres)") },
                    modifier = Modifier.fillMaxWidth(), singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
            }
        },
        confirmButton = {
            Button(onClick = {
                onSave(
                    deviceId,
                    endpoint,
                    interval.toIntOrNull() ?: 30,
                    distance.toIntOrNull() ?: 25,
                )
                onDismiss()
            }) { Text("Save") }
        },
        dismissButton = { OutlinedButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
fun CreateTripDialog(
    devices: List<Device>,
    vehicles: List<Vehicle>,
    onDismiss: () -> Unit,
    onSave: (String, String?, String?, String, String, Boolean) -> Unit,
) {
    var deviceId by rememberSaveable { mutableStateOf(devices.firstOrNull()?.id.orEmpty()) }
    var vehicleId by rememberSaveable { mutableStateOf("") }
    var name by rememberSaveable { mutableStateOf("") }
    var start by rememberSaveable {
        mutableStateOf(Instant.now().minus(1, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS).toString())
    }
    var end by rememberSaveable { mutableStateOf(Instant.now().truncatedTo(ChronoUnit.SECONDS).toString()) }
    var favorite by rememberSaveable { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Create trip") },
        text = {
            Column(
                Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                SelectionField(
                    "Device",
                    devices.firstOrNull { it.id == deviceId }?.let { it.name ?: it.imei } ?: "Select a device",
                    devices.map { it.id to (it.name ?: it.imei) },
                    onSelect = { deviceId = it },
                )
                SelectionField(
                    "Vehicle (optional)",
                    vehicles.firstOrNull { it.id == vehicleId }?.name ?: "No vehicle",
                    listOf("" to "No vehicle") + vehicles.map { it.id to it.name },
                    onSelect = { vehicleId = it },
                )
                OutlinedTextField(name, { name = it }, label = { Text("Trip name") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(start, { start = it }, label = { Text("Start (ISO-8601)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(end, { end = it }, label = { Text("End (ISO-8601)") }, modifier = Modifier.fillMaxWidth())
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Favorite", style = MaterialTheme.typography.titleMedium)
                    Switch(favorite, { favorite = it })
                }
            }
        },
        confirmButton = {
            Button(
                enabled = deviceId.isNotBlank(),
                onClick = {
                    onSave(deviceId, vehicleId.ifBlank { null }, name.ifBlank { null }, start, end, favorite)
                    onDismiss()
                },
            ) { Text("Create") }
        },
        dismissButton = { OutlinedButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun SelectionField(
    label: String,
    value: String,
    choices: List<Pair<String, String>>,
    onSelect: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxWidth()) {
        OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.fillMaxWidth()) {
                Text(label, style = MaterialTheme.typography.labelLarge)
                Text(value, style = MaterialTheme.typography.bodyLarge)
            }
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            choices.forEach { (id, choice) ->
                DropdownMenuItem(
                    text = { Text(choice) },
                    onClick = {
                        onSelect(id)
                        expanded = false
                    },
                )
            }
        }
    }
}

private fun String.decimalInput(): String =
    filterIndexed { index, char -> char.isDigit() || (char == '.' && index > 0 && count { it == '.' } == 1) }

private fun String.isDate(): Boolean = Regex("""\d{4}-\d{2}-\d{2}""").matches(this)
private fun String.isInstant(): Boolean = runCatching { Instant.parse(this) }.isSuccess

private val recordSubtypes = listOf(
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
    "custom",
)
