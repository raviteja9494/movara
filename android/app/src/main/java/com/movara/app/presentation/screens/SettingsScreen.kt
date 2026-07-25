package com.movara.app.presentation.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CloudDone
import androidx.compose.material.icons.rounded.CloudOff
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
import androidx.compose.foundation.text.KeyboardOptions
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
        item { ScreenHeader("Settings", "Server connection, account, and phone tracker configuration.") }
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
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(Modifier.weight(1f)) {
                        Text("Movara server", style = MaterialTheme.typography.titleLarge)
                        Text(
                            "Use the browser-facing root URL; the API path is added automatically.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                    Icon(
                        if (settings.isLoggedIn) Icons.Rounded.CloudDone else Icons.Rounded.CloudOff,
                        contentDescription = null,
                        tint = if (settings.isLoggedIn) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                OutlinedTextField(
                    value = server,
                    onValueChange = { server = it },
                    label = { Text("Server URL") },
                    placeholder = { Text("https://movara.example.com") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                )
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Email") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
                    singleLine = true,
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
                        Text("Save offline", Modifier.padding(start = 8.dp))
                    }
                    Button(
                        onClick = {
                            onLogin(server, email, password)
                        },
                        modifier = Modifier.weight(1f),
                    ) { Text("Login") }
                }
                if (settings.isLoggedIn) {
                    OutlinedButton(onClick = onLogout, modifier = Modifier.fillMaxWidth().padding(top = 10.dp)) {
                        Icon(Icons.Rounded.Logout, null)
                        Text("Log out", Modifier.padding(start = 8.dp))
                    }
                }
            }
        }
        item {
            MovaraCard {
                Text("Phone tracker", style = MaterialTheme.typography.titleLarge)
                Text(
                    "Leave the endpoint blank to derive port 5055 from the server URL.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                )
                OutlinedTextField(
                    value = deviceId,
                    onValueChange = { deviceId = it },
                    label = { Text("Device label") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                )
                OutlinedTextField(
                    value = endpoint,
                    onValueChange = { endpoint = it },
                    label = { Text("OsmAnd endpoint (optional)") },
                    placeholder = { Text("http://server:5055") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                )
                Row(
                    Modifier.fillMaxWidth().padding(top = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    OutlinedTextField(
                        value = interval,
                        onValueChange = { interval = it.filter(Char::isDigit) },
                        label = { Text("Interval (s)") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    )
                    OutlinedTextField(
                        value = distance,
                        onValueChange = { distance = it.filter(Char::isDigit) },
                        label = { Text("Distance (m)") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    )
                }
                Button(
                    onClick = {
                        onSaveTracking(
                            deviceId,
                            endpoint,
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
        item {
            MovaraCard {
                Text("Application", style = MaterialTheme.typography.titleLarge)
                CardDivider()
                KeyValue("UI", "Jetpack Compose + Material 3")
                KeyValue("Storage", "Room + DataStore")
                KeyValue("Networking", "Retrofit + OkHttp")
                KeyValue("Version", "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
            }
        }
    }
}
