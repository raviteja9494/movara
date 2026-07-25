package com.movara.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.movara.app.data.MovaraRepository
import com.movara.app.data.settings.AppSettings
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import java.time.Instant
import javax.inject.Inject

@AndroidEntryPoint
class TrackingService : Service(), LocationListener {
    @Inject lateinit var repository: MovaraRepository

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var locationManager: LocationManager

    override fun onCreate() {
        super.onCreate()
        locationManager = getSystemService(LOCATION_SERVICE) as LocationManager
        ensureNotificationChannel()
        startForeground(NOTIFICATION_ID, notification("Starting tracker"))
        serviceScope.launch {
            val settings = repository.settingsRepository.current()
            repository.settingsRepository.setTrackerActive(true)
            runCatching { repository.updateTrackerState(true) }
            withContext(Dispatchers.Main) { startLocationUpdates(settings) }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, notification("Tracker running in background"))
        return START_STICKY
    }

    override fun onDestroy() {
        runCatching { locationManager.removeUpdates(this) }
        runBlocking(Dispatchers.IO) { repository.settingsRepository.setTrackerActive(false) }
        serviceScope.launch { runCatching { repository.updateTrackerState(false) } }
            .invokeOnCompletion { serviceScope.cancel() }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onLocationChanged(location: Location) {
        serviceScope.launch {
            val settings = repository.settingsRepository.current()
            repository.enqueuePosition(
                deviceLabel = settings.trackingDeviceId.ifBlank { Build.MODEL ?: "phone" },
                timestamp = Instant.ofEpochMilli(
                    location.time.takeIf { it > 0 } ?: System.currentTimeMillis()
                ).toString(),
                latitude = location.latitude,
                longitude = location.longitude,
                speed = if (location.hasSpeed()) location.speed.toDouble() * 3.6 else null,
                accuracy = if (location.hasAccuracy()) location.accuracy.toDouble() else null,
            )
            repository.flushPositions()
            val text = "Tracker active • location captured"
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
                .notify(NOTIFICATION_ID, notification(text))
        }
    }

    @Deprecated("Deprecated in Android framework")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
    override fun onProviderEnabled(provider: String) = Unit
    override fun onProviderDisabled(provider: String) = Unit

    private fun startLocationUpdates(settings: AppSettings) {
        if (
            ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) !=
            PackageManager.PERMISSION_GRANTED &&
            ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            stopSelf()
            return
        }
        listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).forEach { provider ->
            runCatching {
                if (locationManager.isProviderEnabled(provider)) {
                    locationManager.requestLocationUpdates(
                        provider,
                        settings.trackingIntervalSeconds * 1000L,
                        settings.trackingDistanceMeters.toFloat(),
                        this,
                    )
                }
            }
        }
    }

    private fun notification(text: String) =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("Movara tracker")
            .setContentText(text)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Movara tracker",
                NotificationManager.IMPORTANCE_LOW,
            )
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
    }

    companion object {
        private const val CHANNEL_ID = "movara_tracking"
        private const val NOTIFICATION_ID = 1001
    }
}
