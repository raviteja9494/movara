package com.movara.app.presentation.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CloudDone
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material.icons.rounded.ExpandLess
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material.icons.rounded.Logout
import androidx.compose.material.icons.rounded.Save
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.movara.app.BuildConfig
import com.movara.app.presentation.MovaraUiState
import com.movara.app.presentation.components.CardDivider
import com.movara.app.presentation.components.HeroCard
import com.movara.app.presentation.components.KeyValue
import com.movara.app.presentation.components.MovaraCard
import com.movara.app.presentation.components.ScreenHeader

@Composable
fun SettingsScreen(
    state: MovaraUiState,
    onSaveServer: (String) -> Unit,
    onLogin: (String, String, String) -> Unit,
    onLogout: () -> Unit,
    onSaveTracking: (String, String, Int, Int) -> Unit,
) {
    val settings = state.settings
    var server by rememberSaveable { mutableStateOf(settings.serverUrl) }
    var email by rememberSaveable { mutableStateOf(settings.userEmail) }
    var password by rememberSaveable { mutableStateOf("") }
    var deviceId by rememberSaveable { mutableStateOf(settings.trackingDeviceId) }
    var endpoint by rememberSaveable { mutableStateOf(settings.osmandEndpoint) }
    var interval by rememberSaveable { mutableStateOf(settings.trackingIntervalSeconds.toString()) }
    var distance by rememberSaveable { mutableStateOf(settings.trackingDistanceMeters.toString()) }
    var serverExpanded by rememberSaveable { mutableStateOf(false) }
    var trackerExpanded by rememberSaveable { mutableStateOf(false) }
    var appExpanded by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(settings) {
        server = settings.serverUrl
        email = settings.userEmail
        deviceId = settings.trackingDeviceId
        endpoint = settings.osmandEndpoint
        interval = settings.trackingIntervalSeconds.toString()
        distance = settings.trackingDistanceMeters.toString()
    }
    LazyColumn(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 18.dp, 16.dp, 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { ScreenHeader("Settings", "Sections stay collapsed until you need them.") }
        item {
            HeroCard(
                eyebrow = if (settings.isLoggedIn) "Connected" else "Offline",
                title = if (settings.isLoggedIn) settings.userEmail else "Movara companion",
                subtitle = settings.serverUrl.ifBlank { "No server configured" },
                metrics = listOf(
                    "vehicles" to state.vehicles.size.toString(),
                    "pending" to state.pendingCount.toString(),
                    "version" to BuildConfig.VERSION_NAME,
                ),
            )
        }
        item {
            MovaraCard {
                ExpandableHeader(
                    title = "Movara server",
                    subtitle = if (settings.isLoggedIn) "Connected as ${settings.userEmail}" else "Connection and account",
                    expanded = serverExpanded,
                    leading = {
                        Icon(
                            if (settings.isLoggedIn) Icons.Rounded.CloudDone else Icons.Rounded.CloudOff,
                            null,
                            tint = if (settings.isLoggedIn) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    },
                    onClick = { serverExpanded = !serverExpanded },
                )
                if (serverExpanded) {
                    OutlinedTextField(
                        server, { server = it }, label = { Text("Server URL") },
                        placeholder = { Text("https://movara.example.com") }, singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    )
                    OutlinedTextField(
                        email, { email = it }, label = { Text("Email") }, singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    )
                    OutlinedTextField(
                        password, { password = it }, label = { Text("Password") }, singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    )
                    Row(
                        Modifier.fillMaxWidth().padding(top = 14.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        OutlinedButton(onClick = { onSaveServer(server) }, modifier = Modifier.weight(1f)) {
                            Icon(Icons.Rounded.Save, null)
                            Text("Save", Modifier.padding(start = 8.dp))
                        }
                        Button(onClick = { onLogin(server, email, password) }, modifier = Modifier.weight(1f)) {
                            Text("Login")
                        }
                    }
                    if (settings.isLoggedIn) {
                        OutlinedButton(
                            onClick = onLogout,
                            modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                        ) {
                            Icon(Icons.Rounded.Logout, null)
                            Text("Log out", Modifier.padding(start = 8.dp))
                        }
                    }
                }
            }
        }
        item {
            MovaraCard {
                ExpandableHeader(
                    "Phone tracker",
                    "Device label, endpoint, interval, and distance",
                    trackerExpanded,
                    onClick = { trackerExpanded = !trackerExpanded },
                )
                if (trackerExpanded) {
                    OutlinedTextField(
                        deviceId, { deviceId = it }, label = { Text("Device label") },
                        singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                    )
                    OutlinedTextField(
                        endpoint, { endpoint = it }, label = { Text("OsmAnd endpoint (optional)") },
                        placeholder = { Text("http://server:5055") }, singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    )
                    Row(
                        Modifier.fillMaxWidth().padding(top = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        OutlinedTextField(
                            interval, { interval = it.filter(Char::isDigit) },
                            label = { Text("Interval (s)") }, singleLine = true,
                            modifier = Modifier.weight(1f),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        )
                        OutlinedTextField(
                            distance, { distance = it.filter(Char::isDigit) },
                            label = { Text("Distance (m)") }, singleLine = true,
                            modifier = Modifier.weight(1f),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        )
                    }
                    Button(
                        onClick = {
                            onSaveTracking(
                                deviceId, endpoint,
                                interval.toIntOrNull() ?: 30,
                                distance.toIntOrNull() ?: 25,
                            )
                        },
                        modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
                    ) {
                        Icon(Icons.Rounded.Save, null)
                        Text("Save tracker settings", Modifier.padding(start = 8.dp))
                    }
                }
            }
        }
        item {
            MovaraCard {
                ExpandableHeader(
                    "Application",
                    "Libraries and version",
                    appExpanded,
                    onClick = { appExpanded = !appExpanded },
                )
                if (appExpanded) {
                    CardDivider()
                    KeyValue("UI", "Jetpack Compose + Material 3")
                    KeyValue("Storage", "Room + DataStore")
                    KeyValue("Networking", "Retrofit + OkHttp")
                    KeyValue("Version", "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
                }
            }
        }
    }
}

@Composable
private fun ExpandableHeader(
    title: String,
    subtitle: String,
    expanded: Boolean,
    leading: (@Composable () -> Unit)? = null,
    onClick: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        leading?.invoke()
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Icon(if (expanded) Icons.Rounded.ExpandLess else Icons.Rounded.ExpandMore, null)
    }
}
