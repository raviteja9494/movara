package com.movara.app

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URLEncoder
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

    fun createVehicle(draft: DraftVehicle): Vehicle {
        val body = JSONObject()
            .put("name", draft.name)
        draft.licensePlate?.takeIf { it.isNotBlank() }?.let { body.put("licensePlate", it) }
        draft.odometer?.let { body.put("currentOdometer", it) }
        val response = request("POST", "/vehicles", body)
        val item = response.getJSONObject("vehicle")
        return Vehicle(
            id = item.getString("id"),
            name = item.optString("name", draft.name),
            licensePlate = item.optNullableString("licensePlate"),
            odometer = item.optNullableDouble("currentOdometer")
                ?: item.optNullableDouble("estimatedOdometerKm")
        )
    }

    fun fetchDevices(): List<Device> {
        val response = request("GET", "/devices?limit=100", null)
        val data = response.optJSONArray("data") ?: JSONArray()
        val devices = mutableListOf<Device>()
        for (i in 0 until data.length()) {
            val item = data.getJSONObject(i)
            devices += Device(
                id = item.getString("id"),
                imei = item.optString("imei", ""),
                name = item.optNullableString("name"),
                status = item.optString("status", "unknown"),
                protocol = item.optString("protocol", "unknown"),
                lastSeen = item.optNullableString("lastSeen"),
                lastAttributes = item.optJSONObject("lastAttributes")?.toStringMap() ?: emptyMap(),
                packetAttributes = item.optJSONArray("packetAttributes")?.toPacketSnapshots() ?: emptyList()
            )
        }
        return devices
    }

    fun fetchTrips(): List<Trip> {
        val trips = mutableListOf<Trip>()
        var page = 1
        do {
            val response = request("GET", "/trips?limit=100&page=$page", null)
            val data = response.optJSONArray("data") ?: JSONArray()
            for (i in 0 until data.length()) {
                trips += parseTrip(data.getJSONObject(i))
            }
            val pagination = response.optJSONObject("pagination")
            val hasNext = pagination?.optBoolean("hasNextPage", false) ?: false
            page += 1
        } while (hasNext && page <= 20)
        return trips
    }

    private fun parseTrip(item: JSONObject): Trip {
        val vehicle = item.optJSONObject("vehicle")
        val device = item.optJSONObject("device")
        return Trip(
            id = item.getString("id"),
            vehicleId = item.optNullableString("vehicleId"),
            label = item.optNullableString("name") ?: vehicle?.optNullableString("name") ?: "Trip",
            vehicleName = vehicle?.optNullableString("name"),
            deviceName = device?.optNullableString("name") ?: device?.optNullableString("imei"),
            startTime = item.optString("startTime", ""),
            endTime = item.optString("endTime", ""),
            favorite = item.optBoolean("favorite", false),
            source = item.optString("source", "device")
        )
    }

    fun fetchTripDetail(tripId: String): TripDetail {
        val response = request("GET", "/trips/$tripId", null)
        val positions = parsePositions(response.optJSONArray("positions") ?: JSONArray())
        val stopsJson = response.optJSONArray("stops") ?: JSONArray()
        val stops = mutableListOf<TripStop>()
        for (i in 0 until stopsJson.length()) {
            val item = stopsJson.getJSONObject(i)
            stops += TripStop(
                label = item.optString("label", "Stop"),
                startTime = item.optString("startTime", ""),
                endTime = item.optNullableString("endTime"),
                latitude = item.optDouble("latitude"),
                longitude = item.optDouble("longitude"),
                source = "manual"
            )
        }
        val statsJson = response.optJSONObject("stats")
        val stats = statsJson?.let {
            TripStats(
                odometerKm = it.optDouble("odometerKm", 0.0),
                maxSpeedKmh = it.optDouble("maxSpeedKmh", 0.0),
                avgSpeedKmh = it.optDouble("avgSpeedKmh", 0.0),
                pointCount = it.optInt("pointCount", positions.size)
            )
        }
        return TripDetail(
            trip = parseTrip(response.getJSONObject("trip")),
            positions = positions,
            stats = stats,
            stops = stops,
            fuelStops = emptyList()
        )
    }

    fun updateTripFavorite(tripId: String, favorite: Boolean) {
        request("PATCH", "/trips/$tripId", JSONObject().put("favorite", favorite))
    }

    fun createTrip(deviceId: String, vehicleId: String?, name: String?, startTime: String, endTime: String, favorite: Boolean): Trip {
        val body = JSONObject()
            .put("deviceId", deviceId)
            .put("startTime", startTime)
            .put("endTime", endTime)
            .put("favorite", favorite)
        vehicleId?.takeIf { it.isNotBlank() }?.let { body.put("vehicleId", it) }
        name?.takeIf { it.isNotBlank() }?.let { body.put("name", it) }
        val response = request("POST", "/trips", body)
        return parseTrip(response.getJSONObject("trip"))
    }

    fun fetchTripPositions(tripId: String): List<Position> {
        return fetchTripDetail(tripId).positions
    }

    private fun parsePositions(data: JSONArray): List<Position> {
        val positions = mutableListOf<Position>()
        for (i in 0 until data.length()) {
            val item = data.getJSONObject(i)
            positions += Position(
                latitude = item.optDouble("latitude"),
                longitude = item.optDouble("longitude"),
                timestamp = item.optString("timestamp", ""),
                speed = item.optNullableDouble("speed")
            )
        }
        return positions
    }

    fun fetchVehicleRecords(): List<VehicleRecord> {
        val records = mutableListOf<VehicleRecord>()
        var page = 1
        do {
            val response = request("GET", "/vehicle-records?limit=100&page=$page", null)
            val data = response.optJSONArray("data") ?: JSONArray()
            for (i in 0 until data.length()) {
                val item = data.getJSONObject(i)
                records += VehicleRecord(
                    id = item.getString("id"),
                    vehicleId = item.getString("vehicleId"),
                    vehicleName = item.optNullableString("vehicleName"),
                    type = item.optString("type", "record"),
                    subtype = item.optNullableString("subtype"),
                    title = item.optString("title", "Record"),
                    date = item.optString("date", ""),
                    amount = item.optNullableDouble("amount"),
                    odometer = item.optNullableDouble("odometer"),
                    notes = item.optNullableString("notes")
                )
            }
            val pagination = response.optJSONObject("pagination")
            val hasNext = pagination?.optBoolean("hasNextPage", false) ?: false
            page += 1
        } while (hasNext && page <= 20)
        return records
    }

    fun fetchFuelRecords(vehicles: List<Vehicle>): List<FuelRecord> {
        return vehicles.flatMap { vehicle ->
            val response = request("GET", "/vehicles/${vehicle.id}/fuel-records", null)
            val data = response.optJSONArray("fuelRecords") ?: JSONArray()
            val records = mutableListOf<FuelRecord>()
            for (i in 0 until data.length()) {
                val item = data.getJSONObject(i)
                records += FuelRecord(
                    id = item.getString("id"),
                    vehicleId = vehicle.id,
                    vehicleName = vehicle.name,
                    date = item.optString("date", ""),
                    odometer = item.optDouble("odometer", 0.0),
                    fuelQuantity = item.optDouble("fuelQuantity", 0.0),
                    fuelCost = item.optNullableDouble("fuelCost"),
                    fuelRate = item.optNullableDouble("fuelRate"),
                    latitude = item.optNullableDouble("latitude"),
                    longitude = item.optNullableDouble("longitude")
                )
            }
            records
        }.sortedByDescending { it.date }
    }

    fun fetchLatestPositions(deviceId: String, limit: Int = 5, from: String? = null, to: String? = null): List<Position> {
        val query = mutableListOf(
            "deviceId" to deviceId,
            "limit" to limit.toString()
        )
        from?.let { query += "from" to it }
        to?.let { query += "to" to it }
        val path = "/positions/latest?" + query.joinToString("&") { (key, value) ->
            "${encode(key)}=${encode(value)}"
        }
        val response = request("GET", path, null)
        val data = response.optJSONArray("positions") ?: JSONArray()
        val positions = mutableListOf<Position>()
        for (i in 0 until data.length()) {
            val item = data.getJSONObject(i)
            positions += Position(
                latitude = item.optDouble("latitude"),
                longitude = item.optDouble("longitude"),
                timestamp = item.optString("timestamp", ""),
                speed = item.optNullableDouble("speed")
            )
        }
        return positions
    }

    fun uploadMobilePosition(
        deviceLabel: String,
        latitude: Double,
        longitude: Double,
        speed: Double?,
        accuracy: Float?
    ) {
        val body = JSONObject()
            .put("deviceLabel", deviceLabel)
            .put("timestamp", java.time.Instant.now().toString())
            .put("latitude", latitude)
            .put("longitude", longitude)
        speed?.let { body.put("speed", it) }
        accuracy?.let { body.put("accuracy", it.toDouble()) }
        request("POST", "/mobile/positions", body)
    }

    fun uploadQueuedPosition(position: QueuedPosition) {
        uploadOsmAndPosition(position)
    }

    fun updateTrackerState(deviceLabel: String, active: Boolean): Device? {
        val response = request(
            "POST",
            "/mobile/tracker-state",
            JSONObject()
                .put("deviceLabel", deviceLabel.trim().ifBlank { "phone" })
                .put("active", active)
                .put("protocol", "osmand")
        )
        val item = response.optJSONObject("device") ?: return null
        return Device(
            id = item.optString("id", item.optString("imei", deviceLabel)),
            imei = item.optString("imei", deviceLabel),
            name = item.optNullableString("name"),
            status = item.optString("status", if (active) "online" else "offline"),
            protocol = item.optString("protocol", "osmand"),
            lastSeen = item.optNullableString("lastSeen"),
            lastAttributes = item.optJSONObject("lastAttributes")?.toStringMap() ?: emptyMap(),
            packetAttributes = item.optJSONArray("packetAttributes")?.toPacketSnapshots() ?: emptyList()
        )
    }

    private fun uploadOsmAndPosition(position: QueuedPosition) {
        val endpoint = settings.osmandEndpointUrl()
        val id = settings.trackingDeviceId?.trim()?.ifBlank { null } ?: position.deviceLabel
        val params = listOf(
            "id" to id,
            "lat" to position.latitude.toString(),
            "lon" to position.longitude.toString(),
            "timestamp" to position.timestamp,
            "speed" to (position.speed ?: 0.0).toString(),
            "accuracy" to (position.accuracy ?: 0.0).toString(),
            "source" to "movara_android",
            "trackerActive" to settings.trackerActive.toString()
        ).joinToString("&") { (key, value) ->
            "${encode(key)}=${encode(value)}"
        }
        val separator = if (endpoint.contains("?")) "&" else "?"
        val connection = URL("$endpoint$separator$params").openConnection() as HttpURLConnection
        connection.requestMethod = "GET"
        connection.connectTimeout = 10000
        connection.readTimeout = 15000
        val status = connection.responseCode
        if (status !in 200..299) {
            throw IllegalStateException("OsmAnd upload returned HTTP $status.")
        }
    }

    private fun encode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8.name())

    fun uploadMobilePositionLegacy(position: QueuedPosition) {
        val body = JSONObject()
            .put("deviceLabel", position.deviceLabel)
            .put("timestamp", position.timestamp)
            .put("latitude", position.latitude)
            .put("longitude", position.longitude)
        position.speed?.let { body.put("speed", it) }
        position.accuracy?.let { body.put("accuracy", it) }
        request("POST", "/mobile/positions", body)
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

private fun JSONObject.toStringMap(): Map<String, String> {
    val map = linkedMapOf<String, String>()
    val iterator = keys()
    while (iterator.hasNext()) {
        val key = iterator.next()
        val value = opt(key)
        if (value != null && value != JSONObject.NULL) {
            map[key] = value.toString()
        }
    }
    return map
}

private fun JSONArray.toPacketSnapshots(): List<DevicePacketSnapshot> {
    val snapshots = mutableListOf<DevicePacketSnapshot>()
    for (i in 0 until length()) {
        val item = optJSONObject(i) ?: continue
        snapshots += DevicePacketSnapshot(
            packetId = item.optString("packetId", ""),
            updatedAt = item.optString("updatedAt", ""),
            attributes = item.optJSONObject("attributes")?.toStringMap() ?: emptyMap()
        )
    }
    return snapshots
}
