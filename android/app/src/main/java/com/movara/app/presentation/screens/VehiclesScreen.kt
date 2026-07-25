package com.movara.app.presentation.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.DirectionsCar
import androidx.compose.material.icons.rounded.LocalGasStation
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material.icons.rounded.Route
import androidx.compose.material.icons.rounded.SettingsSuggest
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.movara.app.DraftRecord
import com.movara.app.FuelRecord
import com.movara.app.VehicleRecord
import com.movara.app.presentation.MovaraUiState
import com.movara.app.presentation.components.CardDivider
import com.movara.app.presentation.components.ChoiceChips
import com.movara.app.presentation.components.EmptyState
import com.movara.app.presentation.components.EntityRow
import com.movara.app.presentation.components.HeroCard
import com.movara.app.presentation.components.KeyValue
import com.movara.app.presentation.components.MovaraCard
import com.movara.app.presentation.components.ScreenHeader
import com.movara.app.presentation.components.SectionHeader
import java.util.Locale

private enum class VehicleSection(val label: String) {
    OVERVIEW("Overview"), FUEL("Fuel"), RECORDS("Records"), TRIPS("Trips")
}

@Composable
fun VehiclesScreen(
    state: MovaraUiState,
    onOpenVehicle: (String) -> Unit,
    onAddVehicle: () -> Unit,
) {
    LazyColumn(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 18.dp, 16.dp, 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { ScreenHeader("Vehicles", "Choose a vehicle to view its fuel, records, and trips.") }
        item {
            Button(onClick = onAddVehicle, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Rounded.Add, null)
                Text("Add vehicle", Modifier.padding(start = 8.dp))
            }
        }
        item { SectionHeader("Fleet", "${state.vehicles.size} vehicles") }
        if (state.vehicles.isEmpty()) {
            item { EmptyState("No vehicles", "Add your first vehicle; no connection is required.") }
        } else {
            items(state.vehicles, key = { it.id }) { vehicle ->
                val fuel = state.fuelRecords.count { it.vehicleId == vehicle.id }
                val records = state.records.count { it.vehicleId == vehicle.id } +
                    state.drafts.count { it.vehicleId == vehicle.id }
                val trips = state.trips.count { it.vehicleId == vehicle.id }
                EntityRow(
                    icon = Icons.Rounded.DirectionsCar,
                    title = vehicle.name,
                    meta = if (vehicle.isLocal) "LOCAL" else vehicle.licensePlate ?: "SYNCED",
                    detail = "Odometer ${vehicle.odometer?.toLong() ?: 0} km • $fuel fuel • $records records • $trips trips",
                    onClick = { onOpenVehicle(vehicle.id) },
                )
            }
        }
    }
}

@Composable
fun VehicleDetailScreen(
    vehicleId: String,
    state: MovaraUiState,
    onBack: () -> Unit,
    onOpenTrip: (String) -> Unit,
    onAddRecord: (String) -> Unit,
    onAddFuel: (String) -> Unit,
    onEditFuel: (FuelRecord) -> Unit,
    onEditRecord: (VehicleRecord) -> Unit,
    onDeleteDraft: (Long) -> Unit,
) {
    val vehicle = state.vehicles.firstOrNull { it.id == vehicleId }
    if (vehicle == null) {
        EmptyState("Vehicle unavailable", "Return to the fleet and refresh.")
        return
    }
    var section by rememberSaveable { mutableStateOf(VehicleSection.OVERVIEW) }
    var from by rememberSaveable { mutableStateOf("") }
    var to by rememberSaveable { mutableStateOf("") }
    val fuel = state.fuelRecords.filter { it.vehicleId == vehicleId && it.date.inRange(from, to) }
    val records = state.records.filter { it.vehicleId == vehicleId && it.date.inRange(from, to) }
    val drafts = state.drafts.filter { it.vehicleId == vehicleId && it.date.inRange(from, to) }
    val trips = state.trips.filter { it.vehicleId == vehicleId && it.startTime.inRange(from, to) }
    LazyColumn(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 12.dp, 16.dp, 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            OutlinedButton(onClick = onBack) { Text("← Vehicles") }
        }
        item {
            HeroCard(
                eyebrow = if (vehicle.isLocal) "Saved offline" else vehicle.licensePlate ?: "Vehicle",
                title = vehicle.name,
                subtitle = "Complete lifecycle history",
                metrics = listOf(
                    "odometer" to "${vehicle.odometer?.toLong() ?: 0} km",
                    "fuel" to fuel.size.toString(),
                    "records" to (records.size + drafts.size).toString(),
                    "trips" to trips.size.toString(),
                ),
            )
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = { onAddRecord(vehicle.id) }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Rounded.Add, null)
                    Text("Add record", Modifier.padding(start = 8.dp))
                }
                OutlinedButton(onClick = { onAddFuel(vehicle.id) }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Rounded.LocalGasStation, null)
                    Text("Add fuel", Modifier.padding(start = 8.dp))
                }
            }
        }
        item {
            ChoiceChips(
                items = VehicleSection.entries,
                selected = section,
                label = VehicleSection::label,
                onSelect = { section = it },
            )
        }
        item {
            MovaraCard {
                Text("Date range", style = MaterialTheme.typography.titleMedium)
                Row(
                    Modifier.fillMaxWidth().padding(top = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    OutlinedTextField(
                        value = from,
                        onValueChange = { from = it.take(10) },
                        label = { Text("From") },
                        placeholder = { Text("YYYY-MM-DD") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedTextField(
                        value = to,
                        onValueChange = { to = it.take(10) },
                        label = { Text("To") },
                        placeholder = { Text("YYYY-MM-DD") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
        when (section) {
            VehicleSection.OVERVIEW -> {
                item { FuelSummary(fuel) }
                item { SectionHeader("Recent trips", "${trips.size} trips") }
                if (trips.isEmpty()) item { EmptyState("No trips", "No trips match this date range.") }
                else items(trips.take(8), key = { it.id }) { trip ->
                    EntityRow(
                        icon = Icons.Rounded.Route,
                        title = trip.label,
                        meta = if (trip.favorite) "FAVORITE" else trip.source.uppercase(Locale.US),
                        detail = compactRange(trip.startTime, trip.endTime),
                        onClick = { onOpenTrip(trip.id) },
                    )
                }
            }
            VehicleSection.FUEL -> {
                item { FuelSummary(fuel) }
                if (fuel.isEmpty()) item { EmptyState("No fuel records", "Add a fill-up or change the range.") }
                else items(fuel, key = { it.id }) { FuelRow(it) { onEditFuel(it) } }
            }
            VehicleSection.RECORDS -> {
                if (records.isEmpty() && drafts.isEmpty()) {
                    item { EmptyState("No vehicle records", "Add service, document, or expense details.") }
                } else {
                    items(drafts, key = { "draft-${it.id}" }) { DraftRow(it) { onDeleteDraft(it.id) } }
                    items(records, key = { it.id }) { RecordRow(it) { onEditRecord(it) } }
                }
            }
            VehicleSection.TRIPS -> {
                if (trips.isEmpty()) item { EmptyState("No trips", "No trips match this date range.") }
                else items(trips, key = { it.id }) { trip ->
                    EntityRow(
                        icon = Icons.Rounded.Route,
                        title = trip.label,
                        meta = trip.source.uppercase(Locale.US),
                        detail = compactRange(trip.startTime, trip.endTime),
                        onClick = { onOpenTrip(trip.id) },
                    )
                }
            }
        }
    }
}

@Composable
private fun FuelSummary(items: List<FuelRecord>) {
    val totalLitres = items.sumOf { it.fuelQuantity }
    val totalCost = items.sumOf { it.fuelCost ?: 0.0 }
    val averageRate = if (totalLitres > 0) totalCost / totalLitres else 0.0
    MovaraCard {
        Text("Fuel summary", style = MaterialTheme.typography.titleLarge)
        Text(
            "Calculated from the current selection",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodyMedium,
        )
        CardDivider()
        KeyValue("Fill-ups", items.size.toString())
        KeyValue("Quantity", "${format1(totalLitres)} L")
        KeyValue("Cost", format1(totalCost))
        KeyValue("Average rate", "${format1(averageRate)} / L")
        if (items.isNotEmpty()) {
            CardDivider()
            Text("Recent fill-ups", style = MaterialTheme.typography.titleMedium)
            FuelBarChart(items.take(8).reversed())
        }
    }
}

@Composable
private fun FuelBarChart(items: List<FuelRecord>) {
    val max = items.maxOfOrNull { it.fuelQuantity }?.takeIf { it > 0 } ?: 1.0
    Row(
        Modifier.fillMaxWidth().height(140.dp).padding(top = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        items.forEach { fuel ->
            Column(
                Modifier.weight(1f).fillMaxHeight(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Bottom,
            ) {
                Text(format1(fuel.fuelQuantity), style = MaterialTheme.typography.labelSmall)
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height((88 * (fuel.fuelQuantity / max)).coerceAtLeast(6.0).dp)
                        .clip(RoundedCornerShape(topStart = 8.dp, topEnd = 8.dp))
                        .background(MaterialTheme.colorScheme.tertiary)
                )
                Text(fuel.date.take(10).takeLast(5), style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

@Composable
private fun FuelRow(fuel: FuelRecord, onClick: (() -> Unit)? = null) {
    EntityRow(
        icon = Icons.Rounded.LocalGasStation,
        title = "Fuel fill-up",
        meta = fuel.date.take(10),
        detail = "${fuel.vehicleName ?: "Vehicle"} • ${format1(fuel.fuelQuantity)} L • " +
            "odo ${fuel.odometer.toLong()} km${fuel.fuelCost?.let { " • cost ${format1(it)}" }.orEmpty()}",
        accent = MaterialTheme.colorScheme.tertiary,
        onClick = onClick,
    )
}

@Composable
private fun RecordRow(record: VehicleRecord, onClick: (() -> Unit)? = null) {
    val group = recordGroup(record)
    EntityRow(
        icon = group.icon,
        title = record.title,
        meta = group.label.uppercase(Locale.US),
        detail = listOfNotNull(
            record.vehicleName,
            record.date.take(10),
            record.odometer?.let { "odo ${it.toLong()} km" },
            record.amount?.let { "amount ${format1(it)}" },
            record.notes,
        ).joinToString(" • "),
        accent = when (group.label) {
            "Maintenance" -> MaterialTheme.colorScheme.primary
            "Documents" -> MaterialTheme.colorScheme.secondary
            else -> MaterialTheme.colorScheme.tertiary
        },
        onClick = onClick,
    )
}

@Composable
private fun DraftRow(draft: DraftRecord, onDelete: () -> Unit) {
    EntityRow(
        icon = if (draft.syncKind == "fuel") Icons.Rounded.LocalGasStation else Icons.Rounded.SettingsSuggest,
        title = draft.title,
        meta = "LOCAL",
        detail = "${draft.vehicleName} • ${draft.date} • ${draft.lastError ?: "waiting to sync"}",
        onClick = onDelete,
        accent = MaterialTheme.colorScheme.tertiary,
    )
}

private data class RecordGroup(val label: String, val icon: ImageVector)

private fun recordGroup(record: VehicleRecord): RecordGroup = when {
    record.type == "maintenance" -> RecordGroup("Maintenance", Icons.Rounded.SettingsSuggest)
    record.type == "document" ||
        record.subtype?.contains("insurance", true) == true ||
        record.subtype?.contains("registration", true) == true ->
        RecordGroup("Documents", Icons.Rounded.Description)
    else -> RecordGroup("Costs", Icons.Rounded.Payments)
}

private fun String.inRange(from: String, to: String): Boolean {
    val value = take(10)
    return (from.isBlank() || value >= from) && (to.isBlank() || value <= to)
}

private fun format1(value: Double) = String.format(Locale.US, "%.1f", value)
