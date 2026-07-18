package com.movara.app

import android.content.Context
import java.net.URI

class MovaraSettings(context: Context) {
    private val prefs = context.getSharedPreferences("movara_companion", Context.MODE_PRIVATE)

    var serverUrl: String?
        get() = prefs.getString(KEY_SERVER_URL, null)
        set(value) = prefs.edit().putString(KEY_SERVER_URL, value?.trim()?.removeSuffix("/")).apply()

    var token: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_TOKEN, value).apply()

    var userEmail: String?
        get() = prefs.getString(KEY_EMAIL, null)
        set(value) = prefs.edit().putString(KEY_EMAIL, value?.trim()).apply()

    var trackingDeviceId: String?
        get() = prefs.getString(KEY_TRACKING_DEVICE_ID, android.os.Build.MODEL ?: "phone")
        set(value) = prefs.edit().putString(KEY_TRACKING_DEVICE_ID, value?.trim()).apply()

    var osmandEndpoint: String?
        get() = prefs.getString(KEY_OSMAND_ENDPOINT, null)
        set(value) = prefs.edit().putString(KEY_OSMAND_ENDPOINT, value?.trim()?.removeSuffix("/")).apply()

    var trackingIntervalSeconds: Int
        get() = prefs.getInt(KEY_TRACKING_INTERVAL_SECONDS, 30)
        set(value) = prefs.edit().putInt(KEY_TRACKING_INTERVAL_SECONDS, value.coerceIn(5, 3600)).apply()

    var trackingDistanceMeters: Int
        get() = prefs.getInt(KEY_TRACKING_DISTANCE_METERS, 25)
        set(value) = prefs.edit().putInt(KEY_TRACKING_DISTANCE_METERS, value.coerceIn(0, 10000)).apply()

    var trackerActive: Boolean
        get() = prefs.getBoolean(KEY_TRACKER_ACTIVE, false)
        set(value) = prefs.edit().putBoolean(KEY_TRACKER_ACTIVE, value).apply()

    fun apiBaseUrl(): String? {
        val raw = serverUrl?.trim()?.removeSuffix("/") ?: return null
        return when {
            raw.endsWith("/api/v1") -> raw
            raw.endsWith("/api") -> "$raw/v1"
            else -> "$raw/api/v1"
        }
    }

    fun osmandEndpointUrl(): String {
        osmandEndpoint?.takeIf { it.isNotBlank() }?.let { return it }
        val raw = serverUrl?.trim()?.removeSuffix("/") ?: throw IllegalStateException("Set an OsmAnd endpoint or Movara server first.")
        val uri = URI(raw)
        val scheme = uri.scheme ?: "http"
        val host = uri.host ?: raw.removePrefix("http://").removePrefix("https://").substringBefore("/")
        return "$scheme://$host:5055"
    }

    fun hasServer(): Boolean = !serverUrl.isNullOrBlank()

    fun clearSession() {
        prefs.edit().remove(KEY_TOKEN).remove(KEY_EMAIL).apply()
    }

    companion object {
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_TOKEN = "token"
        private const val KEY_EMAIL = "email"
        private const val KEY_TRACKING_DEVICE_ID = "tracking_device_id"
        private const val KEY_OSMAND_ENDPOINT = "osmand_endpoint"
        private const val KEY_TRACKING_INTERVAL_SECONDS = "tracking_interval_seconds"
        private const val KEY_TRACKING_DISTANCE_METERS = "tracking_distance_meters"
        private const val KEY_TRACKER_ACTIVE = "tracker_active"
    }
}
