package com.movara.app.presentation.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.DataObject
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import com.movara.app.presentation.MovaraUiState
import com.movara.app.DeviceCommandPanel
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
        item { ScreenHeader("Devices", "Protocol health, live status, telemetry, and latest route points.") }
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
                    "route points" to (positions?.size?.toString() ?: "…"),
                    "attributes" to device.lastAttributes.size.toString(),
                    "packets" to device.packetAttributes.size.toString(),
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
                KeyValue("Last seen", device.lastSeen?.replace('T', ' ')?.take(19) ?: "Never")
            }
        }
        item { SectionHeader("Recent route", "${positions?.size ?: 0} points • 6 hours") }
        item {
            when {
                positions == null -> MovaraCard { Text("Loading route…") }
                positions.isEmpty() -> EmptyState("No recent points", "The tracker has no route data in this range.")
                else -> RouteMap(positions)
            }
        }
        item {
            Button(onClick = { onLoadPositions(deviceId, 24) }) {
                Icon(Icons.Rounded.Refresh, null)
                Text("Load 24 hours", Modifier.padding(start = 8.dp))
            }
        }
        item { SectionHeader("Device commands", "Send supported protocol commands") }
        item {
            val commands = state.deviceCommands[deviceId]
            when {
                commands == null -> MovaraCard { Text("Loading command support...") }
                !commands.supportsCommands -> EmptyState(
                    "Commands unavailable",
                    "This device protocol does not expose a command channel.",
                )
                else -> DeviceCommandsCard(commands) { key, values ->
                    onSendCommand(deviceId, key, values)
                }
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
    onSend: (String, Map<String, String>) -> Unit,
) {
    var selectedKey by rememberSaveable(panel.commands) {
        mutableStateOf(panel.commands.firstOrNull()?.key.orEmpty())
    }
    var values by remember(selectedKey) { mutableStateOf<Map<String, String>>(emptyMap()) }
    val selected = panel.commands.firstOrNull { it.key == selectedKey }
    MovaraCard {
        Text(
            if (panel.connected) "Command channel connected" else "Command will be queued",
            color = if (panel.connected) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.titleMedium,
        )
        Text("Choose command", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 12.dp))
        panel.commands.forEach { command ->
            if (command.key == selectedKey) {
                Button(onClick = {}, modifier = Modifier.fillMaxWidth().padding(top = 6.dp)) {
                    Text(command.label)
                }
            } else {
                OutlinedButton(
                    onClick = { selectedKey = command.key; values = emptyMap() },
                    modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                ) { Text(command.label) }
            }
        }
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
            Text("Recent commands", style = MaterialTheme.typography.titleMedium)
            panel.history.take(5).forEach { command ->
                KeyValue(
                    command.commandLabel,
                    listOfNotNull(command.status, command.response, command.error).joinToString(" • "),
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
