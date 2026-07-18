package com.movara.app

import android.content.Context

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

    fun apiBaseUrl(): String? {
        val raw = serverUrl?.trim()?.removeSuffix("/") ?: return null
        return when {
            raw.endsWith("/api/v1") -> raw
            raw.endsWith("/api") -> "$raw/v1"
            else -> "$raw/api/v1"
        }
    }

    fun hasServer(): Boolean = !serverUrl.isNullOrBlank()

    fun clearSession() {
        prefs.edit().remove(KEY_TOKEN).remove(KEY_EMAIL).apply()
    }

    companion object {
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_TOKEN = "token"
        private const val KEY_EMAIL = "email"
    }
}
