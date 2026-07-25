package com.movara.app.data.local

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.Transaction
import com.movara.app.DraftRecord
import com.movara.app.QueuedPosition
import com.movara.app.Vehicle
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "vehicles")
data class VehicleEntity(
    @PrimaryKey val id: String,
    val name: String,
    val licensePlate: String?,
    val odometer: Double?,
    val pendingCreate: Boolean,
    val createdAt: Long,
)

@Entity(tableName = "draft_records")
data class DraftRecordEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val syncKind: String,
    val vehicleId: String,
    val vehicleName: String,
    val type: String,
    val subtype: String,
    val title: String,
    val date: String,
    val odometer: Double?,
    val amount: Double?,
    val fuelQuantity: Double?,
    val notes: String?,
    val createdAt: Long,
    val lastError: String?,
)

@Entity(tableName = "queued_positions")
data class QueuedPositionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val deviceLabel: String,
    val timestamp: String,
    val latitude: Double,
    val longitude: Double,
    val speed: Double?,
    val accuracy: Double?,
    val createdAt: Long,
    val lastError: String?,
)

@Dao
abstract class MovaraDao {
    @Query("SELECT * FROM vehicles ORDER BY name COLLATE NOCASE")
    abstract fun observeVehicles(): Flow<List<VehicleEntity>>

    @Query("SELECT * FROM draft_records ORDER BY createdAt DESC")
    abstract fun observeDrafts(): Flow<List<DraftRecordEntity>>

    @Query("SELECT COUNT(*) FROM queued_positions")
    abstract fun observeQueuedPositionCount(): Flow<Int>

    @Query("SELECT * FROM vehicles WHERE pendingCreate = 1 ORDER BY createdAt")
    abstract suspend fun pendingVehicles(): List<VehicleEntity>

    @Query("SELECT * FROM draft_records ORDER BY createdAt")
    abstract suspend fun pendingRecords(): List<DraftRecordEntity>

    @Query("SELECT * FROM queued_positions ORDER BY createdAt LIMIT :limit")
    abstract suspend fun queuedPositions(limit: Int = 250): List<QueuedPositionEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun upsertVehicle(entity: VehicleEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun upsertVehicles(entities: List<VehicleEntity>)

    @Insert
    abstract suspend fun insertDraft(entity: DraftRecordEntity): Long

    @Insert
    abstract suspend fun insertQueuedPosition(entity: QueuedPositionEntity): Long

    @Query("DELETE FROM vehicles WHERE pendingCreate = 0")
    abstract suspend fun deleteRemoteVehicles()

    @Query("DELETE FROM vehicles WHERE id = :id")
    abstract suspend fun deleteVehicle(id: String)

    @Query("DELETE FROM draft_records WHERE id = :id")
    abstract suspend fun deleteDraft(id: Long)

    @Query("DELETE FROM queued_positions WHERE id = :id")
    abstract suspend fun deleteQueuedPosition(id: Long)

    @Query("UPDATE draft_records SET lastError = :message WHERE id = :id")
    abstract suspend fun markDraftError(id: Long, message: String)

    @Query("UPDATE queued_positions SET lastError = :message WHERE id = :id")
    abstract suspend fun markQueuedPositionError(id: Long, message: String)

    @Query("UPDATE draft_records SET vehicleId = :remoteId, vehicleName = :remoteName WHERE vehicleId = :localId")
    abstract suspend fun remapDraftRecords(localId: String, remoteId: String, remoteName: String)

    @Transaction
    open suspend fun replaceRemoteVehicles(vehicles: List<VehicleEntity>) {
        deleteRemoteVehicles()
        upsertVehicles(vehicles)
    }

    @Transaction
    open suspend fun replacePendingVehicle(localId: String, remote: VehicleEntity) {
        remapDraftRecords(localId, remote.id, remote.name)
        deleteVehicle(localId)
        upsertVehicle(remote)
    }
}

@Database(
    entities = [VehicleEntity::class, DraftRecordEntity::class, QueuedPositionEntity::class],
    version = 1,
    exportSchema = true,
)
abstract class MovaraDatabase : RoomDatabase() {
    abstract fun dao(): MovaraDao
}

fun VehicleEntity.toDomain() = Vehicle(id, name, licensePlate, odometer, pendingCreate)

fun DraftRecordEntity.toDomain() = DraftRecord(
    id = id,
    syncKind = syncKind,
    vehicleId = vehicleId,
    vehicleName = vehicleName,
    type = type,
    subtype = subtype,
    title = title,
    date = date,
    odometer = odometer,
    amount = amount,
    fuelQuantity = fuelQuantity,
    notes = notes,
    createdAt = createdAt,
    lastError = lastError,
)

fun QueuedPositionEntity.toDomain() = QueuedPosition(
    id = id,
    deviceLabel = deviceLabel,
    timestamp = timestamp,
    latitude = latitude,
    longitude = longitude,
    speed = speed,
    accuracy = accuracy,
    createdAt = createdAt,
    lastError = lastError,
)
