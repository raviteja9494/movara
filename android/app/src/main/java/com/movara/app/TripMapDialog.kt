package com.movara.app

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.WebSettings
import android.webkit.WebView

object TripMapDialog {
    @SuppressLint("SetJavaScriptEnabled")
    fun webView(context: Context, positions: List<Position>): WebView {
        return WebView(context).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            loadDataWithBaseURL("https://movara.local/", html(positions), "text/html", "UTF-8", null)
        }
    }

    private fun html(positions: List<Position>): String {
        val points = positions.joinToString(",") { "[${it.latitude},${it.longitude}]" }
        val center = positions.firstOrNull()?.let { "[${it.latitude},${it.longitude}]" } ?: "[0,0]"
        return """
            <!doctype html>
            <html>
            <head>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
              <style>
                html, body, #map { height: 100%; margin: 0; background: #e5e7eb; }
                .leaflet-control-attribution { font-size: 10px; }
              </style>
            </head>
            <body>
              <div id="map"></div>
              <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
              <script>
                const points = [$points];
                const map = L.map('map', { zoomControl: true }).setView($center, 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                  maxZoom: 19,
                  attribution: 'OpenStreetMap'
                }).addTo(map);
                if (points.length > 1) {
                  const line = L.polyline(points, { color: '#2563eb', weight: 5, opacity: 0.9 }).addTo(map);
                  L.circleMarker(points[0], { radius: 7, color: '#10b981', fillColor: '#10b981', fillOpacity: 1 }).addTo(map);
                  L.circleMarker(points[points.length - 1], { radius: 7, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 1 }).addTo(map);
                  map.fitBounds(line.getBounds(), { padding: [24, 24] });
                }
              </script>
            </body>
            </html>
        """.trimIndent()
    }
}
