package com.movara.app.presentation.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.DataObject
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.movara.app.DeviceCommandDefinition
import com.movara.app.DeviceCommandPanel
import com.movara.app.DeviceCommandRecord
import com.movara.app.presentation.MovaraUiState
import com.movara.app.presentation.components.CardDivider
import com.movara.app.presentation.components.ChoiceChips
import com.movara.app.presentation.components.EmptyState
import com.movara.app.presentation.components.EntityRow
import com.movara.app.presentation.components.HeroCard
import com.movara.app.presentation.components.KeyValue
import com.movara.app.presentation.components.MovaraCard
import com.movara.app.presentation.components.RouteMap
import com.movara.app.presentation.components.ScreenHeader
import com.movara.app.presentation.components.SectionHeader
import java.time.Duration
import java.time.Instant
import java.util.Locale

@Composable
fun DevicesScreen(
    state: MovaraUiState,
    onRefresh: () -> Unit,
    onOpenDevice: (String) -> Unit,
) {
    LazyColumn(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 18.dp, 16.dp, 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { ScreenHeader("Devices", "Protocol health, live status, telemetry, routes, and commands.") }
        item {
            Button(onClick = onRefresh) {
                Icon(Icons.Rounded.Refresh, null)
                Text("Refresh devices", Modifier.padding(start = 8.dp))
            }
        }
        if (state.devices.isEmpty()) {
            item { EmptyState("No devices", "Connect to Movara and refresh.") }
        } else {
            items(state.devices, key = { it.id }) { device ->
                DeviceRow(device) { onOpenDevice(device.id) }
            }
        }
    }
}

@Composable
fun DeviceDetailScreen(
    deviceId: String,
    state: MovaraUiState,
    onBack: () -> Unit,
    onLoadPositions: (String, Int) -> Unit,
    onLoadCommands: (String) -> Unit,
    onSendCommand: (String, String, Map<String, String>) -> Unit,
) {
    val device = state.devices.firstOrNull { it.id == deviceId }
    val positions = state.devicePositions[deviceId]
    val routeLoading = deviceId in state.deviceRouteLoading
    val routeError = state.deviceRouteErrors[deviceId]
    val routeHours = state.deviceRouteHours[deviceId] ?: 6
    LaunchedEffect(deviceId) {
        if (device != null && positions == null) onLoadPositions(deviceId, 6)
        if (device != null && state.deviceCommands[deviceId] == null) onLoadCommands(deviceId)
    }
    if (device == null) {
        EmptyState("Device unavailable", "Return to Devices and refresh.")
        return
    }
    LazyColumn(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 12.dp, 16.dp, 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { OutlinedButton(onClick = onBack) { Text("← Devices") } }
        item {
            HeroCard(
                eyebrow = device.status,
                title = device.name ?: device.imei.ifBlank { "Tracker" },
                subtitle = "${device.protocol.uppercase(Locale.US)} • ${device.imei}",
                metrics = listOf(
                    "last seen" to relativeLastSeen(device.lastSeen),
                    "route points" to (positions?.size?.toString() ?: "…"),
                    "attributes" to device.lastAttributes.size.toString(),
                ),
            )
        }
        item {
            MovaraCard {
                Text("Device identity", style = MaterialTheme.typography.titleLarge)
                CardDivider()
                KeyValue("Status", device.status)
                KeyValue("Protocol", device.protocol)
                KeyValue("IMEI / ID", device.imei.ifBlank { device.id })
                KeyValue("Last seen", relativeLastSeen(device.lastSeen))
                device.lastSeen?.let { KeyValue("Last report time", it.replace('T', ' ').take(19)) }
            }
        }
        item { SectionHeader("Recent route", "${positions?.size ?: 0} points • $routeHours hours") }
        if (routeError != null) {
            item {
                MovaraCard {
                    Text("Route request failed", style = MaterialTheme.typography.titleMedium)
                    Text(routeError, color = MaterialTheme.colorScheme.error)
                    OutlinedButton(
                        onClick = { onLoadPositions(deviceId, routeHours) },
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    ) { Text("Retry") }
                }
            }
        }
        item {
            when {
                positions == null && routeLoading -> MovaraCard { Text("Loading route…") }
                positions == null -> EmptyState("Route unavailable", "Retry loading recent device positions.")
                positions.isEmpty() -> EmptyState("No recent points", "The tracker has no route data in this range.")
                else -> RouteMap(positions)
            }
        }
        item {
            Button(
                onClick = { onLoadPositions(deviceId, 24) },
                enabled = !routeLoading,
            ) {
                Icon(Icons.Rounded.Refresh, null)
                Text(if (routeLoading) "Loading…" else "Load 24 hours", Modifier.padding(start = 8.dp))
            }
        }
        item { SectionHeader("Device commands", "Send supported protocol commands") }
        item {
            val commands = state.deviceCommands[deviceId]
            val commandError = state.deviceCommandErrors[deviceId]
            when {
                commands == null && deviceId in state.deviceCommandLoading ->
                    MovaraCard { Text("Loading command support…") }
                commands == null && commandError != null -> MovaraCard {
                    Text("Could not load commands", style = MaterialTheme.typography.titleMedium)
                    Text(commandError, color = MaterialTheme.colorScheme.error)
                    OutlinedButton(
                        onClick = { onLoadCommands(deviceId) },
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    ) { Text("Retry") }
                }
                commands == null -> EmptyState("Commands unavailable", "Refresh command support.")
                !commands.supportsCommands -> EmptyState(
                    "Commands unavailable",
                    "This device protocol does not expose a command channel.",
                )
                else -> DeviceCommandsCard(
                    panel = commands,
                    onRefresh = { onLoadCommands(deviceId) },
                    onSend = { key, values -> onSendCommand(deviceId, key, values) },
                )
            }
        }
        item { SectionHeader("Latest attributes", "${device.lastAttributes.size} values") }
        if (device.lastAttributes.isEmpty()) {
            item { EmptyState("No telemetry", "Attributes appear after the device reports.") }
        } else {
            item {
                MovaraCard {
                    device.lastAttributes.toSortedMap().forEach { (key, value) -> KeyValue(key, value) }
                }
            }
        }
        if (device.packetAttributes.isNotEmpty()) {
            item { SectionHeader("Protocol packets", "${device.packetAttributes.size} snapshots") }
            items(device.packetAttributes, key = { "${it.packetId}-${it.updatedAt}" }) { packet ->
                EntityRow(
                    icon = Icons.Rounded.DataObject,
                    title = packetLabel(device.protocol, packet.packetId),
                    meta = packet.updatedAt.replace('T', ' ').take(16),
                    detail = packet.attributes.entries.joinToString(" • ") { "${it.key}: ${it.value}" },
                )
            }
        }
    }
}

@Composable
private fun DeviceCommandsCard(
    panel: DeviceCommandPanel,
    onRefresh: () -> Unit,
    onSend: (String, Map<String, String>) -> Unit,
) {
    var selectedKey by rememberSaveable(panel.commands) {
        mutableStateOf(panel.commands.firstOrNull()?.key.orEmpty())
    }
    var values by remember(selectedKey) { mutableStateOf<Map<String, String>>(emptyMap()) }
    val selected = panel.commands.firstOrNull { it.key == selectedKey }
    MovaraCard {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column(Modifier.weight(1f)) {
                Text("Command console", style = MaterialTheme.typography.titleLarge)
                Text(
                    if (panel.connected) "Live command channel connected" else "Commands will be queued",
                    color = if (panel.connected) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(onClick = onRefresh) { Icon(Icons.Rounded.Refresh, "Refresh commands") }
        }
        Text("Choose command", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 12.dp))
        CommandDropdown(
            commands = panel.commands,
            selectedKey = selectedKey,
            onSelect = { selectedKey = it; values = emptyMap() },
        )
        selected?.let { command ->
            command.description?.let {
                Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 10.dp))
            }
            command.fields.forEach { field ->
                if (field.type == "select" && field.options.isNotEmpty()) {
                    Text(
                        field.label + if (field.required) " *" else "",
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.padding(top = 10.dp),
                    )
                    ChoiceChips(
                        items = field.options,
                        selected = values[field.key].orEmpty(),
                        label = { it },
                        onSelect = { values = values + (field.key to it) },
                    )
                } else {
                    OutlinedTextField(
                        value = values[field.key].orEmpty(),
                        onValueChange = { values = values + (field.key to it) },
                        label = { Text(field.label + if (field.required) " *" else "") },
                        placeholder = { field.placeholder?.let { Text(it) } },
                        supportingText = { field.helpText?.let { Text(it) } },
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                        minLines = if (field.type == "textarea") 3 else 1,
                        singleLine = field.type != "textarea",
                    )
                }
            }
            Button(
                enabled = command.fields.none { it.required && values[it.key].isNullOrBlank() },
                onClick = { onSend(command.key, values) },
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            ) {
                Icon(Icons.Rounded.Send, null)
                Text(if (panel.connected) "Send command" else "Queue command", Modifier.padding(start = 8.dp))
            }
        }
        if (panel.history.isNotEmpty()) {
            CardDivider()
            Text("Command and response history", style = MaterialTheme.typography.titleMedium)
            panel.history.take(10).forEach { command -> CommandHistoryCard(command) }
        }
    }
}

@Composable
private fun CommandHistoryCard(command: DeviceCommandRecord) {
    val statusColor = when (command.status.lowercase(Locale.US)) {
        "responded" -> MaterialTheme.colorScheme.tertiary
        "failed" -> MaterialTheme.colorScheme.error
        "sent" -> MaterialTheme.colorScheme.primary
        else -> MaterialTheme.colorScheme.secondary
    }
    Surface(
        modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .55f),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(command.commandLabel, style = MaterialTheme.typography.titleSmall)
                Text(command.status.uppercase(Locale.US), color = statusColor, style = MaterialTheme.typography.labelLarge)
            }
            command.createdAt?.let { Text(relativeLastSeen(it), style = MaterialTheme.typography.labelSmall) }
            command.sentAt?.let { Text("Sent ${relativeLastSeen(it)}", style = MaterialTheme.typography.labelSmall) }
            command.respondedAt?.let {
                Text("Responded ${relativeLastSeen(it)}", style = MaterialTheme.typography.labelSmall)
            }
            command.content?.takeIf(String::isNotBlank)?.let {
                Text("Command", style = MaterialTheme.typography.labelLarge)
                Text(it, style = MaterialTheme.typography.bodyMedium)
            }
            command.response?.takeIf(String::isNotBlank)?.let {
                Text("Response", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.tertiary)
                Text(it, style = MaterialTheme.typography.bodyMedium)
            }
            command.error?.takeIf(String::isNotBlank)?.let {
                Text("Error", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.error)
                Text(it, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun CommandDropdown(
    commands: List<DeviceCommandDefinition>,
    selectedKey: String,
    onSelect: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selected = commands.firstOrNull { it.key == selectedKey }
    Box(Modifier.fillMaxWidth()) {
        OutlinedButton(
            onClick = { expanded = true },
            modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
        ) {
            Column(Modifier.fillMaxWidth()) {
                Text(selected?.label ?: "Select command", style = MaterialTheme.typography.bodyLarge)
                selected?.category?.let {
                    Text(it.uppercase(Locale.US), style = MaterialTheme.typography.labelSmall)
                }
            }
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier.fillMaxWidth(0.9f),
        ) {
            commands.forEach { command ->
                DropdownMenuItem(
                    text = {
                        Column {
                            Text(command.label)
                            command.description?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                        }
                    },
                    onClick = {
                        onSelect(command.key)
                        expanded = false
                    },
                )
            }
        }
    }
}

private fun packetLabel(protocol: String, packetId: String): String = when (protocol.lowercase(Locale.US)) {
    "gt06" -> "GT06 $packetId"
    "eelink" -> "Eelink $packetId"
    "osmand" -> "OsmAnd HTTP"
    else -> packetId.ifBlank { "Packet" }
}

internal fun relativeLastSeen(value: String?, now: Instant = Instant.now()): String {
    if (value.isNullOrBlank()) return "Never"
    val timestamp = runCatching { Instant.parse(value) }.getOrNull()
        ?: return value.replace('T', ' ').take(19)
    val seconds = Duration.between(timestamp, now).seconds.coerceAtLeast(0)
    return when {
        seconds < 45 -> "Just now"
        seconds < 3_600 -> "${seconds / 60} min ago"
        seconds < 86_400 -> "${seconds / 3_600} hr ago"
        seconds < 604_800 -> "${seconds / 86_400} days ago"
        else -> timestamp.toString().replace('T', ' ').take(10)
    }
}
