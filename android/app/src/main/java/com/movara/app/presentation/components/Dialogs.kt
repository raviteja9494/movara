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
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDatePickerState
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
import com.movara.app.data.VehicleEditorInput
import com.movara.app.data.settings.AppSettings
import java.time.Instant
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.time.ZoneOffset

@Composable
fun VehicleEditorDialog(
    vehicle: Vehicle?,
    devices: List<Device>,
    onDismiss: () -> Unit,
    onSave: (VehicleEditorInput) -> Unit,
) {
    val stateKey = vehicle?.id ?: "new"
    var name by rememberSaveable(stateKey) { mutableStateOf(vehicle?.name.orEmpty()) }
    var description by rememberSaveable(stateKey) { mutableStateOf(vehicle?.description.orEmpty()) }
    var plate by rememberSaveable(stateKey) { mutableStateOf(vehicle?.licensePlate.orEmpty()) }
    var vin by rememberSaveable(stateKey) { mutableStateOf(vehicle?.vin.orEmpty()) }
    var year by rememberSaveable(stateKey) { mutableStateOf(vehicle?.year?.toString().orEmpty()) }
    var make by rememberSaveable(stateKey) { mutableStateOf(vehicle?.make.orEmpty()) }
    var model by rememberSaveable(stateKey) { mutableStateOf(vehicle?.model.orEmpty()) }
    var odometer by rememberSaveable(stateKey) { mutableStateOf(vehicle?.odometer?.toString().orEmpty()) }
    var fuelType by rememberSaveable(stateKey) { mutableStateOf(vehicle?.fuelType.orEmpty()) }
    var icon by rememberSaveable(stateKey) { mutableStateOf(vehicle?.icon ?: "car") }
    var deviceId by rememberSaveable(stateKey) { mutableStateOf(vehicle?.deviceId.orEmpty()) }
    var thirdStart by rememberSaveable(stateKey) {
        mutableStateOf(vehicle?.thirdPartyInsuranceStart?.take(10).orEmpty())
    }
    var thirdEnd by rememberSaveable(stateKey) {
        mutableStateOf(vehicle?.thirdPartyInsuranceEnd?.take(10).orEmpty())
    }
    var thirdProvider by rememberSaveable(stateKey) {
        mutableStateOf(vehicle?.thirdPartyInsuranceProvider.orEmpty())
    }
    var thirdNumber by rememberSaveable(stateKey) {
        mutableStateOf(vehicle?.thirdPartyInsuranceNumber.orEmpty())
    }
    var ownStart by rememberSaveable(stateKey) {
        mutableStateOf(vehicle?.ownInsuranceStart?.take(10).orEmpty())
    }
    var ownEnd by rememberSaveable(stateKey) {
        mutableStateOf(vehicle?.ownInsuranceEnd?.take(10).orEmpty())
    }
    var ownProvider by rememberSaveable(stateKey) {
        mutableStateOf(vehicle?.ownInsuranceProvider.orEmpty())
    }
    var ownNumber by rememberSaveable(stateKey) {
        mutableStateOf(vehicle?.ownInsuranceNumber.orEmpty())
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (vehicle == null) "Add vehicle" else "Edit vehicle") },
        text = {
            Column(
                Modifier.heightIn(max = 620.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("Identity", style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(
                    name, { name = it }, label = { Text("Vehicle name") },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    description, { description = it }, label = { Text("Description") },
                    minLines = 2, modifier = Modifier.fillMaxWidth(),
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        make, { make = it }, label = { Text("Make") },
                        singleLine = true, modifier = Modifier.weight(1f),
                    )
                    OutlinedTextField(
                        model, { model = it }, label = { Text("Model") },
                        singleLine = true, modifier = Modifier.weight(1f),
                    )
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        year, { year = it.filter(Char::isDigit).take(4) }, label = { Text("Year") },
                        singleLine = true, modifier = Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    )
                    SelectionField(
                        "Icon",
                        icon.replaceFirstChar(Char::uppercase),
                        listOf("car", "bike", "truck", "van", "bus", "sedan").map { it to it.replaceFirstChar(Char::uppercase) },
                        onSelect = { icon = it },
                        modifier = Modifier.weight(1f),
                    )
                }
                OutlinedTextField(
                    plate, { plate = it }, label = { Text("License plate") },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    vin, { vin = it.take(17) }, label = { Text("VIN") },
                    supportingText = { Text("${vin.length}/17") },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        odometer, { odometer = it.decimalInput() }, label = { Text("Odometer") },
                        singleLine = true, modifier = Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    )
                    OutlinedTextField(
                        fuelType, { fuelType = it }, label = { Text("Fuel type") },
                        singleLine = true, modifier = Modifier.weight(1f),
                    )
                }
                Text("Linked device", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Link a GPS device to associate automatically created ignition trips with this vehicle.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
                SelectionField(
                    "Linked device (optional)",
                    devices.firstOrNull { it.id == deviceId }?.let { it.name ?: it.imei }
                        ?: deviceId.ifBlank { "No linked device" },
                    listOf("" to "No linked device") + devices.map {
                        it.id to "${it.name ?: it.imei} • ${it.protocol.uppercase()}"
                    },
                    onSelect = { deviceId = it },
                )
                Text("Third-party insurance", style = MaterialTheme.typography.titleMedium)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CalendarDateField(
                        "Start", thirdStart, { thirdStart = it },
                        modifier = Modifier.weight(1f), allowClear = true,
                    )
                    CalendarDateField(
                        "End", thirdEnd, { thirdEnd = it },
                        modifier = Modifier.weight(1f), allowClear = true,
                    )
                }
                OutlinedTextField(
                    thirdProvider, { thirdProvider = it }, label = { Text("Provider") },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    thirdNumber, { thirdNumber = it }, label = { Text("Policy number") },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                Text("Own-damage insurance", style = MaterialTheme.typography.titleMedium)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CalendarDateField(
                        "Start", ownStart, { ownStart = it },
                        modifier = Modifier.weight(1f), allowClear = true,
                    )
                    CalendarDateField(
                        "End", ownEnd, { ownEnd = it },
                        modifier = Modifier.weight(1f), allowClear = true,
                    )
                }
                OutlinedTextField(
                    ownProvider, { ownProvider = it }, label = { Text("Provider") },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    ownNumber, { ownNumber = it }, label = { Text("Policy number") },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            Button(
                enabled = name.isNotBlank() &&
                    (year.isBlank() || year.toIntOrNull()?.let { it in 1900..2100 } == true) &&
                    (odometer.isBlank() || odometer.toDoubleOrNull()?.let { it >= 0 } == true) &&
                    listOf(thirdStart, thirdEnd, ownStart, ownEnd).all { it.isBlank() || it.isDate() } &&
                    (thirdStart.isBlank() || thirdEnd.isBlank() || thirdStart <= thirdEnd) &&
                    (ownStart.isBlank() || ownEnd.isBlank() || ownStart <= ownEnd),
                onClick = {
                    onSave(
                        VehicleEditorInput(
                            name = name,
                            description = description.ifBlank { null },
                            licensePlate = plate.ifBlank { null },
                            vin = vin.ifBlank { null },
                            year = year.toIntOrNull(),
                            make = make.ifBlank { null },
                            model = model.ifBlank { null },
                            odometer = odometer.toDoubleOrNull(),
                            fuelType = fuelType.ifBlank { null },
                            icon = icon.ifBlank { null },
                            deviceId = deviceId.ifBlank { null },
                            thirdPartyInsuranceStart = thirdStart.ifBlank { null },
                            thirdPartyInsuranceEnd = thirdEnd.ifBlank { null },
                            thirdPartyInsuranceProvider = thirdProvider.ifBlank { null },
                            thirdPartyInsuranceNumber = thirdNumber.ifBlank { null },
                            ownInsuranceStart = ownStart.ifBlank { null },
                            ownInsuranceEnd = ownEnd.ifBlank { null },
                            ownInsuranceProvider = ownProvider.ifBlank { null },
                            ownInsuranceNumber = ownNumber.ifBlank { null },
                        )
                    )
                    onDismiss()
                },
            ) { Text("Save") }
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
    var validFrom by rememberSaveable(record.id) { mutableStateOf(record.validFrom?.take(10).orEmpty()) }
    var validUntil by rememberSaveable(record.id) { mutableStateOf(record.validUntil?.take(10).orEmpty()) }
    var provider by rememberSaveable(record.id) { mutableStateOf(record.provider.orEmpty()) }
    var reference by rememberSaveable(record.id) { mutableStateOf(record.referenceNumber.orEmpty()) }
    var reminderMode by rememberSaveable(record.id) { mutableStateOf(record.reminderMode) }
    var reminderDays by rememberSaveable(record.id) {
        mutableStateOf(record.reminderDaysBefore?.toString().orEmpty())
    }
    var recurringDays by rememberSaveable(record.id) {
        mutableStateOf(record.recurringIntervalDays?.toString().orEmpty())
    }
    var recurringKm by rememberSaveable(record.id) {
        mutableStateOf(record.recurringIntervalKm?.toString().orEmpty())
    }
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
                OutlinedTextField(
                    provider, { provider = it }, label = { Text("Provider / workshop") },
                    modifier = Modifier.fillMaxWidth(), singleLine = true,
                )
                OutlinedTextField(
                    reference, { reference = it }, label = { Text("Reference number") },
                    modifier = Modifier.fillMaxWidth(), singleLine = true,
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        validFrom, { validFrom = it.take(10) }, label = { Text("Valid from") },
                        placeholder = { Text("YYYY-MM-DD") }, modifier = Modifier.weight(1f), singleLine = true,
                    )
                    OutlinedTextField(
                        validUntil, { validUntil = it.take(10) }, label = { Text("Valid until") },
                        placeholder = { Text("YYYY-MM-DD") }, modifier = Modifier.weight(1f), singleLine = true,
                    )
                }
                SelectionField(
                    "Reminder",
                    reminderMode.replace('_', ' '),
                    listOf(
                        "none" to "None",
                        "on_date" to "On date",
                        "recurring_date" to "Recurring date",
                        "recurring_odometer" to "Recurring odometer",
                    ),
                    onSelect = { reminderMode = it },
                )
                if (reminderMode == "on_date") {
                    OutlinedTextField(
                        reminderDays, { reminderDays = it.filter(Char::isDigit) },
                        label = { Text("Remind days before") }, modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    )
                }
                if (reminderMode == "recurring_date") {
                    OutlinedTextField(
                        recurringDays, { recurringDays = it.filter(Char::isDigit) },
                        label = { Text("Repeat every days") }, modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    )
                }
                if (reminderMode == "recurring_odometer") {
                    OutlinedTextField(
                        recurringKm, { recurringKm = it.filter(Char::isDigit) },
                        label = { Text("Repeat every kilometres") }, modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    )
                }
                OutlinedButton(
                    onClick = { confirmDelete = true },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Delete vehicle record") }
            }
        },
        confirmButton = {
            Button(
                enabled = title.isNotBlank() && date.isDate() &&
                    (validFrom.isBlank() || validFrom.isDate()) &&
                    (validUntil.isBlank() || validUntil.isDate()) &&
                    (validFrom.isBlank() || validUntil.isBlank() || validFrom <= validUntil) &&
                    (reminderMode != "on_date" ||
                        reminderDays.toIntOrNull()?.let { it in 0..365 } == true) &&
                    (reminderMode != "recurring_date" ||
                        recurringDays.toIntOrNull()?.let { it > 0 } == true) &&
                    (reminderMode != "recurring_odometer" ||
                        recurringKm.toIntOrNull()?.let { it > 0 } == true) &&
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
                        validFrom = validFrom.ifBlank { null },
                        validUntil = validUntil.ifBlank { null },
                        provider = provider.ifBlank { null },
                        referenceNumber = reference.ifBlank { null },
                        reminderMode = reminderMode,
                        reminderDaysBefore = reminderDays.toIntOrNull().takeIf { reminderMode == "on_date" },
                        recurringIntervalDays = recurringDays.toIntOrNull()
                            .takeIf { reminderMode == "recurring_date" },
                        recurringIntervalKm = recurringKm.toIntOrNull()
                            .takeIf { reminderMode == "recurring_odometer" },
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
    var name by rememberSaveable(trip.id) { mutableStateOf(trip.name.orEmpty()) }
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
                    candidates.firstOrNull { it.id == targetId }
                        ?.let { it.name?.takeIf(String::isNotBlank) ?: it.id.take(8) }
                        ?: "No compatible trip",
                    candidates.map {
                        it.id to "${it.name?.takeIf(String::isNotBlank) ?: it.id.take(8)} • ${it.startTime.take(16)}"
                    },
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CalendarDateField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    allowClear: Boolean = false,
) {
    var showPicker by remember { mutableStateOf(false) }
    OutlinedButton(onClick = { showPicker = true }, modifier = modifier) {
        Column(Modifier.fillMaxWidth()) {
            Text(label, style = MaterialTheme.typography.labelLarge)
            Text(value.ifBlank { "Select date" }, style = MaterialTheme.typography.bodyLarge)
        }
    }
    if (showPicker) {
        val initial = runCatching {
            LocalDate.parse(value).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli()
        }.getOrNull()
        val picker = rememberDatePickerState(initialSelectedDateMillis = initial)
        DatePickerDialog(
            onDismissRequest = { showPicker = false },
            confirmButton = {
                Button(onClick = {
                    picker.selectedDateMillis?.let {
                        onValueChange(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString())
                    }
                    showPicker = false
                }) { Text("Done") }
            },
            dismissButton = {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (allowClear) OutlinedButton(onClick = {
                        onValueChange("")
                        showPicker = false
                    }) { Text("Clear") }
                    OutlinedButton(onClick = { showPicker = false }) { Text("Cancel") }
                }
            },
        ) {
            DatePicker(state = picker)
        }
    }
}

@Composable
private fun SelectionField(
    label: String,
    value: String,
    choices: List<Pair<String, String>>,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    Box(modifier.fillMaxWidth()) {
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
