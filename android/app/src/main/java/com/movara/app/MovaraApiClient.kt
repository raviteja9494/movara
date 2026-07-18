package com.movara.app

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

class MovaraApiClient(private val settings: MovaraSettings) {
    fun login(email: String, password: String): String {
        val body = JSONObject()
            .put("email", email.trim())
            .put("password", password)
        val response = request("POST", "/auth/login", body, requireToken = false)
        return response.getString("token")
    }

    fun fetchVehicles(): List<Vehicle> {
        val response = request("GET", "/vehicles?limit=100", null)
        val data = response.optJSONArray("data") ?: JSONArray()
        val vehicles = mutableListOf<Vehicle>()
        for (i in 0 until data.length()) {
            val item = data.getJSONObject(i)
            vehicles += Vehicle(
                id = item.getString("id"),
                name = item.optString("name", "Vehicle"),
                licensePlate = item.optNullableString("licensePlate"),
                odometer = item.optNullableDouble("currentOdometer")
                    ?: item.optNullableDouble("estimatedOdometerKm")
            )
        }
        return vehicles
    }

    fun createVehicleRecord(draft: DraftRecord) {
        if (draft.syncKind == "fuel") {
            createFuelRecord(draft)
            return
        }

        val body = JSONObject()
            .put("vehicleId", draft.vehicleId)
            .put("type", draft.type)
            .put("subtype", draft.subtype)
            .put("title", draft.title)
            .put("date", draft.date)
            .put("reminderMode", "none")

        draft.notes?.takeIf { it.isNotBlank() }?.let { body.put("notes", it.trim()) }
        draft.odometer?.let { body.put("odometer", it.toLong()) }
        draft.amount?.let { body.put("amount", it) }

        request("POST", "/vehicle-records", body)
    }

    private fun createFuelRecord(draft: DraftRecord) {
        val body = JSONObject()
            .put("date", draft.date)
            .put("odometer", draft.odometer?.toLong() ?: 0L)
            .put("fuelQuantity", draft.fuelQuantity ?: 0.0)

        draft.amount?.let { body.put("fuelCost", it) }
        request("POST", "/vehicles/${draft.vehicleId}/fuel-records", body)
    }

    private fun request(
        method: String,
        path: String,
        body: JSONObject?,
        requireToken: Boolean = true
    ): JSONObject {
        val base = settings.apiBaseUrl() ?: throw IllegalStateException("Set a Movara server first.")
        val connection = URL("$base$path").openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = 10000
        connection.readTimeout = 15000
        connection.setRequestProperty("Accept", "application/json")
        if (requireToken) {
            val token = settings.token ?: throw IllegalStateException("Log in before syncing.")
            connection.setRequestProperty("Authorization", "Bearer $token")
        }
        if (body != null) {
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { stream ->
                stream.write(body.toString().toByteArray(Charsets.UTF_8))
            }
        }

        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val text = stream?.use {
            BufferedReader(InputStreamReader(it, Charsets.UTF_8)).readText()
        }.orEmpty()
        if (status !in 200..299) {
            val message = runCatching {
                JSONObject(text).optString("message").ifBlank {
                    JSONObject(text).optString("error")
                }
            }.getOrNull().orEmpty()
            throw IllegalStateException(message.ifBlank { "Server returned HTTP $status." })
        }
        return if (text.isBlank()) JSONObject() else JSONObject(text)
    }
}

private fun JSONObject.optNullableString(name: String): String? {
    if (!has(name) || isNull(name)) return null
    return optString(name).takeIf { it.isNotBlank() }
}

private fun JSONObject.optNullableDouble(name: String): Double? {
    if (!has(name) || isNull(name)) return null
    return optDouble(name)
}
