package com.movara.app

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

class MovaraStore(context: Context) : SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE vehicles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                license_plate TEXT,
                odometer REAL,
                updated_at INTEGER NOT NULL
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE draft_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sync_kind TEXT NOT NULL,
                vehicle_id TEXT NOT NULL,
                vehicle_name TEXT NOT NULL,
                type TEXT NOT NULL,
                subtype TEXT NOT NULL,
                title TEXT NOT NULL,
                date TEXT NOT NULL,
                odometer REAL,
                amount REAL,
                fuel_quantity REAL,
                notes TEXT,
                created_at INTEGER NOT NULL,
                last_error TEXT
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE queued_positions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_label TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                speed REAL,
                accuracy REAL,
                created_at INTEGER NOT NULL,
                last_error TEXT
            )
            """.trimIndent()
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 3) {
            db.execSQL(
                """
                CREATE TABLE IF NOT EXISTS queued_positions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    device_label TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    latitude REAL NOT NULL,
                    longitude REAL NOT NULL,
                    speed REAL,
                    accuracy REAL,
                    created_at INTEGER NOT NULL,
                    last_error TEXT
                )
                """.trimIndent()
            )
        }
    }

    fun replaceVehicles(vehicles: List<Vehicle>) {
        writableDatabase.beginTransaction()
        try {
            writableDatabase.delete("vehicles", null, null)
            vehicles.forEach { vehicle ->
                val values = ContentValues().apply {
                    put("id", vehicle.id)
                    put("name", vehicle.name)
                    put("license_plate", vehicle.licensePlate)
                    put("odometer", vehicle.odometer)
                    put("updated_at", System.currentTimeMillis())
                }
                writableDatabase.insertWithOnConflict(
                    "vehicles",
                    null,
                    values,
                    SQLiteDatabase.CONFLICT_REPLACE
                )
            }
            writableDatabase.setTransactionSuccessful()
        } finally {
            writableDatabase.endTransaction()
        }
    }

    fun vehicles(): List<Vehicle> {
        val items = mutableListOf<Vehicle>()
        readableDatabase.query(
            "vehicles",
            arrayOf("id", "name", "license_plate", "odometer"),
            null,
            null,
            null,
            null,
            "name COLLATE NOCASE"
        ).use { cursor ->
            while (cursor.moveToNext()) {
                items += Vehicle(
                    id = cursor.getString(0),
                    name = cursor.getString(1),
                    licensePlate = if (cursor.isNull(2)) null else cursor.getString(2),
                    odometer = if (cursor.isNull(3)) null else cursor.getDouble(3)
                )
            }
        }
        return items
    }

    fun addDraft(
        syncKind: String,
        vehicle: Vehicle,
        type: String,
        subtype: String,
        title: String,
        date: String,
        odometer: Double?,
        amount: Double?,
        fuelQuantity: Double?,
        notes: String?
    ): Long {
        val values = ContentValues().apply {
            put("sync_kind", syncKind)
            put("vehicle_id", vehicle.id)
            put("vehicle_name", vehicle.name)
            put("type", type)
            put("subtype", subtype)
            put("title", title)
            put("date", date)
            put("odometer", odometer)
            put("amount", amount)
            put("fuel_quantity", fuelQuantity)
            put("notes", notes)
            put("created_at", System.currentTimeMillis())
        }
        return writableDatabase.insert("draft_records", null, values)
    }

    fun drafts(): List<DraftRecord> {
        val items = mutableListOf<DraftRecord>()
        readableDatabase.query(
            "draft_records",
            arrayOf(
                "id",
                "sync_kind",
                "vehicle_id",
                "vehicle_name",
                "type",
                "subtype",
                "title",
                "date",
                "odometer",
                "amount",
                "fuel_quantity",
                "notes",
                "created_at",
                "last_error"
            ),
            null,
            null,
            null,
            null,
            "created_at DESC"
        ).use { cursor ->
            while (cursor.moveToNext()) {
                items += DraftRecord(
                    id = cursor.getLong(0),
                    syncKind = cursor.getString(1),
                    vehicleId = cursor.getString(2),
                    vehicleName = cursor.getString(3),
                    type = cursor.getString(4),
                    subtype = cursor.getString(5),
                    title = cursor.getString(6),
                    date = cursor.getString(7),
                    odometer = if (cursor.isNull(8)) null else cursor.getDouble(8),
                    amount = if (cursor.isNull(9)) null else cursor.getDouble(9),
                    fuelQuantity = if (cursor.isNull(10)) null else cursor.getDouble(10),
                    notes = if (cursor.isNull(11)) null else cursor.getString(11),
                    createdAt = cursor.getLong(12),
                    lastError = if (cursor.isNull(13)) null else cursor.getString(13)
                )
            }
        }
        return items
    }

    fun deleteDraft(id: Long) {
        writableDatabase.delete("draft_records", "id = ?", arrayOf(id.toString()))
    }

    fun markDraftError(id: Long, error: String) {
        val values = ContentValues().apply { put("last_error", error.take(300)) }
        writableDatabase.update("draft_records", values, "id = ?", arrayOf(id.toString()))
    }

    fun addQueuedPosition(
        deviceLabel: String,
        timestamp: String,
        latitude: Double,
        longitude: Double,
        speed: Double?,
        accuracy: Double?
    ): Long {
        val values = ContentValues().apply {
            put("device_label", deviceLabel)
            put("timestamp", timestamp)
            put("latitude", latitude)
            put("longitude", longitude)
            put("speed", speed)
            put("accuracy", accuracy)
            put("created_at", System.currentTimeMillis())
        }
        return writableDatabase.insert("queued_positions", null, values)
    }

    fun queuedPositions(limit: Int = 100): List<QueuedPosition> {
        val items = mutableListOf<QueuedPosition>()
        readableDatabase.query(
            "queued_positions",
            arrayOf("id", "device_label", "timestamp", "latitude", "longitude", "speed", "accuracy", "created_at", "last_error"),
            null,
            null,
            null,
            null,
            "created_at ASC",
            limit.toString()
        ).use { cursor ->
            while (cursor.moveToNext()) {
                items += QueuedPosition(
                    id = cursor.getLong(0),
                    deviceLabel = cursor.getString(1),
                    timestamp = cursor.getString(2),
                    latitude = cursor.getDouble(3),
                    longitude = cursor.getDouble(4),
                    speed = if (cursor.isNull(5)) null else cursor.getDouble(5),
                    accuracy = if (cursor.isNull(6)) null else cursor.getDouble(6),
                    createdAt = cursor.getLong(7),
                    lastError = if (cursor.isNull(8)) null else cursor.getString(8)
                )
            }
        }
        return items
    }

    fun queuedPositionCount(): Int {
        readableDatabase.rawQuery("SELECT COUNT(*) FROM queued_positions", null).use { cursor ->
            return if (cursor.moveToFirst()) cursor.getInt(0) else 0
        }
    }

    fun deleteQueuedPosition(id: Long) {
        writableDatabase.delete("queued_positions", "id = ?", arrayOf(id.toString()))
    }

    fun markQueuedPositionError(id: Long, error: String) {
        val values = ContentValues().apply { put("last_error", error.take(300)) }
        writableDatabase.update("queued_positions", values, "id = ?", arrayOf(id.toString()))
    }

    companion object {
        private const val DB_NAME = "movara_companion.db"
        private const val DB_VERSION = 3
    }
}
