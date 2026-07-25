package com.movara.app.presentation.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AddRoad
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Flag
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.CallMerge
import androidx.compose.material.icons.rounded.CallSplit
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Route
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.movara.app.Position
import com.movara.app.Trip
import com.movara.app.TripStop
import com.movara.app.presentation.MovaraUiState
import com.movara.app.presentation.components.CardDivider
import com.movara.app.presentation.components.CalendarDateField
import com.movara.app.presentation.components.ChoiceChips
import com.movara.app.presentation.components.EmptyState
import com.movara.app.presentation.components.ConfirmDeleteDialog
import com.movara.app.presentation.components.EditTripDialog
import com.movara.app.presentation.components.EntityRow
import com.movara.app.presentation.components.HeroCard
import com.movara.app.presentation.components.KeyValue
import com.movara.app.presentation.components.MovaraCard
import com.movara.app.presentation.components.RouteMap
import com.movara.app.presentation.components.MergeTripDialog
import com.movara.app.presentation.components.SplitTripDialog
import com.movara.app.presentation.components.ScreenHeader
import com.movara.app.presentation.components.SectionHeader
import java.time.Instant
import java.util.Locale

private enum class TripFilter(val label: String) { ALL("All"), FAVORITES("Favorites") }

@Composable
fun TripsScreen(
    state: MovaraUiState,
    onRefresh: () -> Unit,
    onCreate: () -> Unit,
    onOpenTrip: (String) -> Unit,
) {
    var filter by rememberSaveable { mutableStateOf(TripFilter.ALL) }
    var from by rememberSaveable { mutableStateOf("") }
    var to by rememberSaveable { mutableStateOf("") }
    val trips = state.trips.filter {
        (filter == TripFilter.ALL || it.favorite) &&
            (from.isBlank() || it.startTime.take(10) >= from) &&
            (to.isBlank() || it.startTime.take(10) <= to)
    }
    LazyColumn(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 18.dp, 16.dp, 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { ScreenHeader("Trips", "Browse complete routes, stops, vehicle links, and favorites.") }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = onCreate, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Rounded.AddRoad, null)
                    Text("Create trip", Modifier.padding(start = 8.dp))
                }
                OutlinedButton(onClick = onRefresh, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Rounded.Refresh, null)
                    Text("Refresh", Modifier.padding(start = 8.dp))
                }
            }
        }
        item {
            ChoiceChips(
                items = TripFilter.entries,
                selected = filter,
                label = TripFilter::label,
                onSelect = { filter = it },
            )
        }
        item {
            MovaraCard {
                Text("Date range", style = MaterialTheme.typography.titleMedium)
                Row(
                    Modifier.fillMaxWidth().padding(top = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    CalendarDateField(
                        "From", from, { from = it },
                        modifier = Modifier.weight(1f), allowClear = true,
                    )
                    CalendarDateField(
                        "To", to, { to = it },
                        modifier = Modifier.weight(1f), allowClear = true,
                    )
                }
            }
        }
        if (trips.isEmpty()) {
            item { EmptyState("No trips", "Create a trip or refresh data from Movara.") }
        } else {
            items(trips, key = { it.id }) { trip -> TripRow(trip) { onOpenTrip(trip.id) } }
        }
    }
}

@Composable
fun TripDetailScreen(
    tripId: String,
    state: MovaraUiState,
    onBack: () -> Unit,
    onLoad: (String) -> Unit,
    onToggleFavorite: (Trip) -> Unit,
    onUpdate: (Trip, String, String, String) -> Unit,
    onSplit: (Trip, String) -> Unit,
    onMerge: (Trip, String) -> Unit,
    onDelete: (Trip) -> Unit,
) {
    val listTrip = state.trips.firstOrNull { it.id == tripId }
    val detail = state.tripDetails[tripId]
    LaunchedEffect(tripId) {
        if (detail == null) onLoad(tripId)
    }
    val trip = detail?.trip ?: listTrip
    if (trip == null) {
        EmptyState("Trip unavailable", "Return to Trips and refresh.")
        return
    }
    val positions = detail?.positions.orEmpty()
    val detectedStops = detectStops(positions)
    var editOpen by rememberSaveable { mutableStateOf(false) }
    var splitOpen by rememberSaveable { mutableStateOf(false) }
    var mergeOpen by rememberSaveable { mutableStateOf(false) }
    var adjacentTargetId by rememberSaveable { mutableStateOf<String?>(null) }
    var deleteOpen by rememberSaveable { mutableStateOf(false) }
    val mergeCandidates = state.trips.filter { candidate ->
        candidate.id != trip.id &&
            candidate.source == trip.source &&
            (
                (trip.deviceId != null && candidate.deviceId == trip.deviceId) ||
                    (trip.vehicleId != null && candidate.vehicleId == trip.vehicleId)
                )
    }.sortedBy { it.startTime }
    LazyColumn(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 12.dp, 16.dp, 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { OutlinedButton(onClick = onBack) { Text("← Trips") } }
        item {
            HeroCard(
                eyebrow = trip.source,
                title = trip.label,
                subtitle = "${trip.vehicleName ?: trip.deviceName ?: "Unknown vehicle"}\n${compactRange(trip.startTime, trip.endTime)}",
                metrics = listOf(
                    "distance" to "${format1(detail?.stats?.odometerKm ?: 0.0)} km",
                    "max speed" to "${format1(detail?.stats?.maxSpeedKmh ?: 0.0)} km/h",
                    "points" to positions.size.toString(),
                ),
            )
        }
        item {
            Button(onClick = { onToggleFavorite(trip) }, modifier = Modifier.fillMaxWidth()) {
                Icon(if (trip.favorite) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder, null)
                Text(
                    if (trip.favorite) "Remove from favorites" else "Add to favorites",
                    Modifier.padding(start = 8.dp),
                )
            }
        }
        item {
            MovaraCard {
                Text("Manage trip", style = MaterialTheme.typography.titleLarge)
                Row(
                    Modifier.fillMaxWidth().padding(top = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedButton(onClick = { editOpen = true }, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Rounded.Edit, null)
                        Text("Edit", Modifier.padding(start = 6.dp))
                    }
                    OutlinedButton(onClick = { splitOpen = true }, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Rounded.CallSplit, null)
                        Text("Split", Modifier.padding(start = 6.dp))
                    }
                }
                Row(
                    Modifier.fillMaxWidth().padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedButton(
                        onClick = {
                            adjacentTargetId = null
                            mergeOpen = true
                        },
                        enabled = mergeCandidates.isNotEmpty(),
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Rounded.CallMerge, null)
                        Text("Merge", Modifier.padding(start = 6.dp))
                    }
                    OutlinedButton(onClick = { deleteOpen = true }, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Rounded.Delete, null)
                        Text("Delete", Modifier.padding(start = 6.dp))
                    }
                }
                if (detail?.previousTrip != null || detail?.nextTrip != null) {
                    CardDivider()
                    Text("Adjacent trips", style = MaterialTheme.typography.titleMedium)
                    detail?.previousTrip?.let { previous ->
                        OutlinedButton(
                            onClick = {
                                adjacentTargetId = previous.id
                                mergeOpen = true
                            },
                            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                        ) {
                            Icon(Icons.Rounded.CallMerge, null)
                            Text(
                                "Merge previous · ${previous.startTime.replace('T', ' ').take(16)}",
                                Modifier.padding(start = 6.dp),
                            )
                        }
                    }
                    detail?.nextTrip?.let { next ->
                        OutlinedButton(
                            onClick = {
                                adjacentTargetId = next.id
                                mergeOpen = true
                            },
                            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                        ) {
                            Icon(Icons.Rounded.CallMerge, null)
                            Text(
                                "Merge next · ${next.startTime.replace('T', ' ').take(16)}",
                                Modifier.padding(start = 6.dp),
                            )
                        }
                    }
                }
            }
        }
        item { SectionHeader("Route map", "${positions.size} points") }
        item {
            when {
                detail == null -> MovaraCard { Text("Loading route…") }
                positions.isEmpty() -> EmptyState("No route points", "This trip has no recorded positions.")
                else -> RouteMap(positions)
            }
        }
        detail?.stats?.let { stats ->
            item {
                MovaraCard {
                    Text("Trip statistics", style = MaterialTheme.typography.titleLarge)
                    CardDivider()
                    KeyValue("Distance", "${format1(stats.odometerKm)} km")
                    KeyValue("Average speed", "${format1(stats.avgSpeedKmh)} km/h")
                    KeyValue("Maximum speed", "${format1(stats.maxSpeedKmh)} km/h")
                    KeyValue("Route points", stats.pointCount.toString())
                }
            }
        }
        item { SectionHeader("Stops", "${detail?.stops.orEmpty().size + detectedStops.size} found") }
        val allStops = detail?.stops.orEmpty() + detectedStops
        if (allStops.isEmpty()) {
            item { EmptyState("No stops detected", "Stops longer than three minutes appear here.") }
        } else {
            items(allStops) { stop ->
                EntityRow(
                    icon = Icons.Rounded.Flag,
                    title = stop.label,
                    meta = stop.source.uppercase(Locale.US),
                    detail = "${compactRange(stop.startTime, stop.endTime.orEmpty())}\n" +
                        "${formatCoord(stop.latitude)}, ${formatCoord(stop.longitude)}",
                )
            }
        }
    }
    if (editOpen) {
        EditTripDialog(
            trip,
            onDismiss = { editOpen = false },
            onSave = { name, start, end -> onUpdate(trip, name, start, end) },
        )
    }
    if (splitOpen) {
        SplitTripDialog(trip, onDismiss = { splitOpen = false }, onSplit = { onSplit(trip, it) })
    }
    if (mergeOpen) {
        MergeTripDialog(
            trip,
            adjacentTargetId?.let { id ->
                listOfNotNull(detail?.previousTrip, detail?.nextTrip).filter { it.id == id }
            } ?: mergeCandidates,
            onDismiss = {
                mergeOpen = false
                adjacentTargetId = null
            },
            onMerge = { onMerge(trip, it) },
        )
    }
    if (deleteOpen) {
        ConfirmDeleteDialog(
            "Delete trip?",
            "This removes the trip from Movara. This action cannot be undone.",
            onDismiss = { deleteOpen = false },
            onDelete = { onDelete(trip) },
        )
    }
}

@Composable
private fun TripRow(trip: Trip, onClick: () -> Unit) {
    EntityRow(
        icon = Icons.Rounded.Route,
        title = trip.label,
        meta = if (trip.favorite) "FAVORITE" else trip.source.uppercase(Locale.US),
        detail = "${trip.vehicleName ?: trip.deviceName ?: "Unknown vehicle"}\n${compactRange(trip.startTime, trip.endTime)}",
        accent = if (trip.favorite) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.secondary,
        onClick = onClick,
    )
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
                val startTime = runCatching { Instant.parse(positions[start].timestamp).toEpochMilli() }.getOrNull()
                val endTime = runCatching { Instant.parse(positions[end].timestamp).toEpochMilli() }.getOrNull()
                if (startTime != null && endTime != null && endTime - startTime >= 180_000) {
                    val middle = positions[(start + end) / 2]
                    stops += TripStop(
                        "Detected stop",
                        positions[start].timestamp,
                        positions[end].timestamp,
                        middle.latitude,
                        middle.longitude,
                        "detected",
                    )
                }
            }
            startIndex = null
        }
    }
    return stops
}

private fun format1(value: Double) = String.format(Locale.US, "%.1f", value)
private fun formatCoord(value: Double) = String.format(Locale.US, "%.5f", value)
