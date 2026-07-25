package com.movara.app.presentation.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CloudSync
import androidx.compose.material.icons.rounded.DirectionsCar
import androidx.compose.material.icons.rounded.LocalGasStation
import androidx.compose.material.icons.rounded.Route
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.movara.app.presentation.MovaraUiState
import com.movara.app.presentation.components.EmptyState
import com.movara.app.presentation.components.EntityRow
import com.movara.app.presentation.components.HeroCard
import com.movara.app.presentation.components.MovaraCard
import com.movara.app.presentation.components.SectionHeader
import java.util.Locale

@Composable
fun HomeScreen(
    state: MovaraUiState,
    onOpenVehicle: (String) -> Unit,
    onOpenTrip: (String) -> Unit,
    onSync: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 18.dp, 16.dp, 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            HeroCard(
                eyebrow = if (state.settings.isLoggedIn) "Connected" else "Offline companion",
                title = "Your fleet, ready to move",
                subtitle = state.settings.serverUrl.ifBlank {
                    "Add vehicles and records offline, then connect to your Movara server."
                },
                metrics = listOf(
                    "vehicles" to state.vehicles.size.toString(),
                    "recent trips" to state.trips.size.toString(),
                    "pending" to state.pendingCount.toString(),
                ),
            )
        }
        item {
            Button(onClick = onSync, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Rounded.CloudSync, null)
                Text("Sync everything", Modifier.padding(start = 8.dp))
            }
        }
        item { SectionHeader("Fleet", "${state.vehicles.size} vehicles") }
        if (state.vehicles.isEmpty()) {
            item { EmptyState("No vehicles yet", "Create one now; it can be synchronized later.") }
        } else {
            items(state.vehicles.take(4), key = { it.id }) { vehicle ->
                EntityRow(
                    icon = Icons.Rounded.DirectionsCar,
                    title = vehicle.name,
                    meta = if (vehicle.isLocal) "LOCAL" else vehicle.licensePlate ?: "SYNCED",
                    detail = "Odometer ${vehicle.odometer?.toLong() ?: 0} km",
                    onClick = { onOpenVehicle(vehicle.id) },
                )
            }
        }
        item { SectionHeader("Recent trips", "${state.trips.size} loaded") }
        if (state.trips.isEmpty()) {
            item { EmptyState("No trips loaded", "Connect and refresh to see recent routes.") }
        } else {
            items(state.trips.take(4), key = { it.id }) { trip ->
                EntityRow(
                    icon = Icons.Rounded.Route,
                    title = trip.label,
                    meta = if (trip.favorite) "FAVORITE" else trip.source.uppercase(Locale.US),
                    detail = "${trip.vehicleName ?: trip.deviceName ?: "Unknown vehicle"}\n${compactRange(trip.startTime, trip.endTime)}",
                    onClick = { onOpenTrip(trip.id) },
                )
            }
        }
        item { SectionHeader("Pending sync", "${state.pendingCount} items") }
        item {
            MovaraCard {
                EntityRow(
                    icon = Icons.Rounded.LocalGasStation,
                    title = "${state.drafts.size} vehicle records",
                    meta = "OFFLINE",
                    detail = "${state.vehicles.count { it.isLocal }} vehicles and ${state.queuedPositions} GPS points are also waiting.",
                )
            }
        }
    }
}

internal fun compactRange(start: String, end: String): String =
    "${start.replace('T', ' ').take(16)} → ${end.replace('T', ' ').take(16)}"
