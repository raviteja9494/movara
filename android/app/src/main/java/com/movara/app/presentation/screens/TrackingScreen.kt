package com.movara.app.presentation.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.GpsFixed
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.PauseCircle
import androidx.compose.material.icons.rounded.PlayCircle
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.movara.app.Device
import com.movara.app.presentation.MovaraUiState
import com.movara.app.presentation.components.EmptyState
import com.movara.app.presentation.components.EntityRow
import com.movara.app.presentation.components.HeroCard
import com.movara.app.presentation.components.KeyValue
import com.movara.app.presentation.components.MovaraCard
import com.movara.app.presentation.components.ScreenHeader
import com.movara.app.presentation.components.SectionHeader
import java.util.Locale

@Composable
fun TrackingScreen(
    state: MovaraUiState,
    onSendLocation: () -> Unit,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onConfigure: () -> Unit,
    onOpenDevice: (String) -> Unit,
) {
    val settings = state.settings
    LazyColumn(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 18.dp, 16.dp, 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { ScreenHeader("Phone tracker", "Turn this phone into an offline-first Movara GPS device.") }
        item {
            HeroCard(
                eyebrow = if (settings.trackerActive) "Tracking active" else "Tracker paused",
                title = settings.trackingDeviceId.ifBlank { "This phone" },
                subtitle = runCatching { settings.osmandEndpointUrl() }.getOrElse { "Configure a server or endpoint" },
                metrics = listOf(
                    "interval" to "${settings.trackingIntervalSeconds}s",
                    "distance" to "${settings.trackingDistanceMeters}m",
                    "GPS queued" to state.queuedPositions.toString(),
                ),
            )
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = onSendLocation, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Rounded.LocationOn, null)
                    Text("Send now", Modifier.padding(start = 8.dp))
                }
                OutlinedButton(onClick = onConfigure, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Rounded.Settings, null)
                    Text("Configure", Modifier.padding(start = 8.dp))
                }
            }
        }
        item {
            if (settings.trackerActive) {
                OutlinedButton(onClick = onStop, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Rounded.PauseCircle, null)
                    Text("Stop continuous tracking", Modifier.padding(start = 8.dp))
                }
            } else {
                Button(onClick = onStart, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Rounded.PlayCircle, null)
                    Text("Start continuous tracking", Modifier.padding(start = 8.dp))
                }
            }
        }
        item {
            MovaraCard {
                Text("How it behaves", style = MaterialTheme.typography.titleLarge)
                KeyValue("Offline", "Points stay queued on the phone")
                KeyValue("Background", "Foreground service keeps tracking")
                KeyValue("Upload", "OsmAnd protocol on port 5055")
            }
        }
        item { SectionHeader("Live devices", "${state.devices.size} trackers") }
        if (state.devices.isEmpty()) {
            item { EmptyState("No trackers loaded", "Log in and refresh to see device status.") }
        } else {
            items(state.devices, key = { it.id }) { device ->
                DeviceRow(device, onClick = { onOpenDevice(device.id) })
            }
        }
    }
}

@Composable
internal fun DeviceRow(device: Device, onClick: () -> Unit) {
    EntityRow(
        icon = Icons.Rounded.GpsFixed,
        title = device.name ?: device.imei.ifBlank { "Tracker" },
        meta = device.status.uppercase(Locale.US),
        detail = "${device.protocol.uppercase(Locale.US)} • last seen ${relativeLastSeen(device.lastSeen)}" +
            deviceTelemetrySummary(device).takeIf(String::isNotBlank)?.let { "\n$it" }.orEmpty(),
        accent = if (device.status.equals("online", true) || device.status.equals("active", true)) {
            MaterialTheme.colorScheme.primary
        } else MaterialTheme.colorScheme.onSurfaceVariant,
        onClick = onClick,
    )
}

internal fun deviceTelemetrySummary(device: Device): String {
    val attrs = device.lastAttributes
    fun first(vararg keys: String) = keys.firstNotNullOfOrNull { attrs[it]?.takeIf(String::isNotBlank) }
    return listOfNotNull(
        first("battery_level", "batteryPercent", "battery")?.let { "Battery $it" },
        first("battery_charging", "charging")?.let { "Charging $it" },
        first("ignition", "engine_on")?.let { "Ignition $it" },
        first("gsm_signal_percent", "signal", "rssi")?.let { "Signal $it" },
        first("tracker_active")?.let { "Phone tracker $it" },
    ).joinToString(" • ")
}
