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
import java.time.Instant

class TrackingService : Service(), LocationListener {
    private lateinit var store: MovaraStore
    private lateinit var settings: MovaraSettings
    private lateinit var api: MovaraApiClient
    private lateinit var locationManager: LocationManager

    override fun onCreate() {
        super.onCreate()
        store = MovaraStore(this)
        settings = MovaraSettings(this)
        api = MovaraApiClient(settings)
        locationManager = getSystemService(LOCATION_SERVICE) as LocationManager
        ensureNotificationChannel()
        startForeground(NOTIFICATION_ID, notification("Starting tracker"))
        startLocationUpdates()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, notification("Tracking in background"))
        startLocationUpdates()
        return START_STICKY
    }

    override fun onDestroy() {
        runCatching { locationManager.removeUpdates(this) }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onLocationChanged(location: Location) {
        val label = settings.trackingDeviceId?.takeIf { it.isNotBlank() } ?: (Build.MODEL ?: "phone")
        store.addQueuedPosition(
            deviceLabel = label,
            timestamp = Instant.ofEpochMilli(location.time.takeIf { it > 0 } ?: System.currentTimeMillis()).toString(),
            latitude = location.latitude,
            longitude = location.longitude,
            speed = if (location.hasSpeed()) location.speed.toDouble() * 3.6 else null,
            accuracy = if (location.hasAccuracy()) location.accuracy.toDouble() else null
        )
        Thread {
            TrackingSync.flush(store, api)
            val pending = store.queuedPositionCount()
            val text = if (pending == 0) "Tracking and synced" else "Tracking - $pending queued"
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIFICATION_ID, notification(text))
        }.start()
    }

    @Deprecated("Deprecated in Android framework")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit

    override fun onProviderEnabled(provider: String) = Unit

    override fun onProviderDisabled(provider: String) = Unit

    private fun startLocationUpdates() {
        if (
            ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED
        ) {
            stopSelf()
            return
        }
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
        providers.forEach { provider ->
            runCatching {
                if (locationManager.isProviderEnabled(provider)) {
                    locationManager.requestLocationUpdates(
                        provider,
                        settings.trackingIntervalSeconds * 1000L,
                        settings.trackingDistanceMeters.toFloat(),
                        this
                    )
                }
            }
        }
    }

    private fun notification(text: String) =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("Movara tracking")
            .setContentText(text)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "Movara tracking", NotificationManager.IMPORTANCE_LOW)
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
        }
    }

    companion object {
        private const val CHANNEL_ID = "movara_tracking"
        private const val NOTIFICATION_ID = 1001
    }
}
