package com.movara.app.data.network

import com.google.gson.JsonObject
import com.movara.app.data.settings.SettingsRepository
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response
import okhttp3.HttpUrl.Companion.toHttpUrl
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import javax.inject.Inject
import javax.inject.Singleton

data class LoginRequest(val email: String, val password: String)
data class LoginResponse(val token: String)

data class VehicleDto(
    val id: String,
    val name: String? = null,
    val licensePlate: String? = null,
    val currentOdometer: Double? = null,
    val estimatedOdometerKm: Double? = null,
)

data class VehicleListResponse(val data: List<VehicleDto> = emptyList())
data class CreateVehicleRequest(val name: String, val licensePlate: String?, val currentOdometer: Double?)
data class VehicleResponse(val vehicle: VehicleDto)

data class DevicePacketDto(
    val packetId: String? = null,
    val updatedAt: String? = null,
    val attributes: Map<String, Any?>? = null,
)

data class DeviceDto(
    val id: String,
    val imei: String? = null,
    val name: String? = null,
    val status: String? = null,
    val protocol: String? = null,
    val lastSeen: String? = null,
    val lastAttributes: Map<String, Any?>? = null,
    val packetAttributes: List<DevicePacketDto>? = null,
)

data class DeviceListResponse(val data: List<DeviceDto> = emptyList())
data class TrackerStateRequest(val deviceLabel: String, val active: Boolean, val protocol: String = "osmand")
data class TrackerStateResponse(val device: DeviceDto? = null)

data class TripVehicleDto(val name: String? = null)
data class TripDeviceDto(val name: String? = null, val imei: String? = null)
data class TripDto(
    val id: String,
    val vehicleId: String? = null,
    val name: String? = null,
    val vehicle: TripVehicleDto? = null,
    val device: TripDeviceDto? = null,
    val startTime: String? = null,
    val endTime: String? = null,
    val favorite: Boolean? = null,
    val source: String? = null,
)

data class PaginationDto(val hasNextPage: Boolean = false)
data class TripListResponse(
    val data: List<TripDto> = emptyList(),
    val pagination: PaginationDto? = null,
)

data class PositionDto(
    val latitude: Double,
    val longitude: Double,
    val timestamp: String? = null,
    val speed: Double? = null,
)

data class TripStatsDto(
    val odometerKm: Double? = null,
    val maxSpeedKmh: Double? = null,
    val avgSpeedKmh: Double? = null,
    val pointCount: Int? = null,
)

data class TripStopDto(
    val label: String? = null,
    val startTime: String? = null,
    val endTime: String? = null,
    val latitude: Double,
    val longitude: Double,
)

data class TripDetailResponse(
    val trip: TripDto,
    val positions: List<PositionDto> = emptyList(),
    val stats: TripStatsDto? = null,
    val stops: List<TripStopDto> = emptyList(),
)

data class UpdateFavoriteRequest(val favorite: Boolean)
data class CreateTripRequest(
    val deviceId: String,
    val vehicleId: String?,
    val name: String?,
    val startTime: String,
    val endTime: String,
    val favorite: Boolean,
)
data class TripResponse(val trip: TripDto)

data class VehicleRecordDto(
    val id: String,
    val vehicleId: String,
    val vehicleName: String? = null,
    val type: String? = null,
    val subtype: String? = null,
    val title: String? = null,
    val date: String? = null,
    val amount: Double? = null,
    val odometer: Double? = null,
    val notes: String? = null,
)

data class VehicleRecordListResponse(
    val data: List<VehicleRecordDto> = emptyList(),
    val pagination: PaginationDto? = null,
)

data class CreateVehicleRecordRequest(
    val vehicleId: String,
    val type: String,
    val subtype: String,
    val title: String,
    val date: String,
    val reminderMode: String = "none",
    val notes: String?,
    val odometer: Long?,
    val amount: Double?,
)

data class FuelRecordDto(
    val id: String,
    val date: String? = null,
    val odometer: Double? = null,
    val fuelQuantity: Double? = null,
    val fuelCost: Double? = null,
    val fuelRate: Double? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
)

data class FuelRecordListResponse(val fuelRecords: List<FuelRecordDto> = emptyList())
data class CreateFuelRecordRequest(
    val date: String,
    val odometer: Long,
    val fuelQuantity: Double,
    val fuelCost: Double?,
)

data class PositionListResponse(val positions: List<PositionDto> = emptyList())

interface MovaraApiService {
    @POST("api/v1/auth/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    @GET("api/v1/vehicles")
    suspend fun vehicles(@Query("limit") limit: Int = 100): VehicleListResponse

    @POST("api/v1/vehicles")
    suspend fun createVehicle(@Body request: CreateVehicleRequest): VehicleResponse

    @GET("api/v1/devices")
    suspend fun devices(@Query("limit") limit: Int = 100): DeviceListResponse

    @GET("api/v1/trips")
    suspend fun trips(@Query("limit") limit: Int = 100, @Query("page") page: Int): TripListResponse

    @GET("api/v1/trips/{id}")
    suspend fun trip(@Path("id") id: String): TripDetailResponse

    @PATCH("api/v1/trips/{id}")
    suspend fun updateTrip(@Path("id") id: String, @Body request: UpdateFavoriteRequest): JsonObject

    @POST("api/v1/trips")
    suspend fun createTrip(@Body request: CreateTripRequest): TripResponse

    @GET("api/v1/vehicle-records")
    suspend fun vehicleRecords(
        @Query("limit") limit: Int = 100,
        @Query("page") page: Int,
    ): VehicleRecordListResponse

    @POST("api/v1/vehicle-records")
    suspend fun createVehicleRecord(@Body request: CreateVehicleRecordRequest): JsonObject

    @GET("api/v1/vehicles/{id}/fuel-records")
    suspend fun fuelRecords(@Path("id") vehicleId: String): FuelRecordListResponse

    @POST("api/v1/vehicles/{id}/fuel-records")
    suspend fun createFuelRecord(
        @Path("id") vehicleId: String,
        @Body request: CreateFuelRecordRequest,
    ): JsonObject

    @GET("api/v1/positions/latest")
    suspend fun positions(
        @Query("deviceId") deviceId: String,
        @Query("limit") limit: Int,
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
    ): PositionListResponse

    @POST("api/v1/mobile/tracker-state")
    suspend fun updateTrackerState(@Body request: TrackerStateRequest): TrackerStateResponse
}

@Singleton
class DynamicServerInterceptor @Inject constructor(
    private val settingsRepository: SettingsRepository,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val settings = runBlocking { settingsRepository.current() }
        check(settings.serverUrl.isNotBlank()) { "Set a Movara server first." }
        val base = settings.apiRoot().let { if (it.endsWith("/")) it else "$it/" }.toHttpUrl()
        val requestUrl = chain.request().url
        val basePath = base.encodedPath.trimEnd('/')
        val requestPath = requestUrl.encodedPath.trimStart('/')
        val url = requestUrl.newBuilder()
            .scheme(base.scheme)
            .host(base.host)
            .port(base.port)
            .encodedPath("$basePath/$requestPath")
            .build()
        return chain.proceed(chain.request().newBuilder().url(url).build())
    }
}

@Singleton
class AuthInterceptor @Inject constructor(
    private val settingsRepository: SettingsRepository,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = runBlocking { settingsRepository.current() }.token
        val request = chain.request().newBuilder().apply {
            if (token.isNotBlank()) header("Authorization", "Bearer $token")
            header("Accept", "application/json")
        }.build()
        return chain.proceed(request)
    }
}
