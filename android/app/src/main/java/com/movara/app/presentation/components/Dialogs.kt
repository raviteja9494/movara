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
import com.movara.app.Vehicle
import com.movara.app.data.RecordDraftInput
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
    onDismiss: () -> Unit,
    onSave: (RecordDraftInput) -> Unit,
) {
    var vehicleId by rememberSaveable(initialVehicleId) {
        mutableStateOf(initialVehicleId ?: vehicles.firstOrNull()?.id.orEmpty())
    }
    var fuel by rememberSaveable { mutableStateOf(false) }
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
                        listOf("service", "repair", "insurance", "registration", "custom").map { it to it },
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
