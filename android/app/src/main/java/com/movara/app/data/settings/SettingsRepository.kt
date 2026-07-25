package com.movara.app.data.settings

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.io.IOException
import java.net.URI
import javax.inject.Inject
import javax.inject.Singleton

data class AppSettings(
    val serverUrl: String = "",
    val token: String = "",
    val userEmail: String = "",
    val trackingDeviceId: String = android.os.Build.MODEL ?: "phone",
    val osmandEndpoint: String = "",
    val trackingIntervalSeconds: Int = 30,
    val trackingDistanceMeters: Int = 25,
    val trackerActive: Boolean = false,
) {
    val isLoggedIn: Boolean get() = token.isNotBlank()

    fun apiRoot(): String {
        val raw = normalizedServerUrl()
        return when {
            raw.endsWith("/api/v1") -> raw.removeSuffix("/api/v1")
            raw.endsWith("/api") -> raw.removeSuffix("/api")
            else -> raw
        }
    }

    fun apiBaseUrl(): String = "${apiRoot()}/api/v1/"

    fun osmandEndpointUrl(): String {
        osmandEndpoint.trim().removeSuffix("/").takeIf(String::isNotBlank)?.let { return it }
        val raw = apiRoot()
        check(raw.isNotBlank()) { "Set a Movara server or OsmAnd endpoint first." }
        val uri = URI(raw)
        val scheme = uri.scheme ?: "http"
        val host = uri.host ?: raw.removePrefix("http://").removePrefix("https://").substringBefore("/")
        return "$scheme://$host:5055"
    }

    private fun normalizedServerUrl() = serverUrl.trim().removeSuffix("/")
}

@Singleton
class SettingsRepository @Inject constructor(
    private val dataStore: DataStore<Preferences>,
) {
    val settings: Flow<AppSettings> = dataStore.data
        .catch { error ->
            if (error is IOException) emit(androidx.datastore.preferences.core.emptyPreferences()) else throw error
        }
        .map { preferences ->
            AppSettings(
                serverUrl = preferences[Keys.SERVER_URL].orEmpty(),
                token = preferences[Keys.TOKEN].orEmpty(),
                userEmail = preferences[Keys.EMAIL].orEmpty(),
                trackingDeviceId = preferences[Keys.TRACKING_DEVICE_ID]
                    ?: (android.os.Build.MODEL ?: "phone"),
                osmandEndpoint = preferences[Keys.OSMAND_ENDPOINT].orEmpty(),
                trackingIntervalSeconds = preferences[Keys.TRACKING_INTERVAL_SECONDS] ?: 30,
                trackingDistanceMeters = preferences[Keys.TRACKING_DISTANCE_METERS] ?: 25,
                trackerActive = preferences[Keys.TRACKER_ACTIVE] ?: false,
            )
        }

    suspend fun current(): AppSettings = settings.first()

    suspend fun saveServer(serverUrl: String) {
        val normalized = serverUrl.trim().removeSuffix("/")
        dataStore.edit { preferences ->
            val changed = preferences[Keys.SERVER_URL] != normalized
            preferences[Keys.SERVER_URL] = normalized
            if (changed) {
                preferences.remove(Keys.TOKEN)
                preferences.remove(Keys.EMAIL)
                preferences.remove(Keys.OSMAND_ENDPOINT)
            }
        }
    }

    suspend fun saveSession(email: String, token: String) {
        dataStore.edit { preferences ->
            preferences[Keys.EMAIL] = email.trim()
            preferences[Keys.TOKEN] = token
        }
    }

    suspend fun clearSession() {
        dataStore.edit { preferences ->
            preferences.remove(Keys.TOKEN)
            preferences.remove(Keys.EMAIL)
        }
    }

    suspend fun saveTracking(
        deviceId: String,
        endpoint: String,
        intervalSeconds: Int,
        distanceMeters: Int,
    ) {
        dataStore.edit { preferences ->
            preferences[Keys.TRACKING_DEVICE_ID] = deviceId.trim().ifBlank { android.os.Build.MODEL ?: "phone" }
            if (endpoint.isBlank()) preferences.remove(Keys.OSMAND_ENDPOINT)
            else preferences[Keys.OSMAND_ENDPOINT] = endpoint.trim().removeSuffix("/")
            preferences[Keys.TRACKING_INTERVAL_SECONDS] = intervalSeconds.coerceIn(5, 3600)
            preferences[Keys.TRACKING_DISTANCE_METERS] = distanceMeters.coerceIn(0, 10_000)
        }
    }

    suspend fun setTrackerActive(active: Boolean) {
        dataStore.edit { it[Keys.TRACKER_ACTIVE] = active }
    }

    private object Keys {
        val SERVER_URL = stringPreferencesKey("server_url")
        val TOKEN = stringPreferencesKey("token")
        val EMAIL = stringPreferencesKey("email")
        val TRACKING_DEVICE_ID = stringPreferencesKey("tracking_device_id")
        val OSMAND_ENDPOINT = stringPreferencesKey("osmand_endpoint")
        val TRACKING_INTERVAL_SECONDS = intPreferencesKey("tracking_interval_seconds")
        val TRACKING_DISTANCE_METERS = intPreferencesKey("tracking_distance_meters")
        val TRACKER_ACTIVE = booleanPreferencesKey("tracker_active")
    }
}
