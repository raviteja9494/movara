package com.movara.app.presentation.components

import android.graphics.Color
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.OpenInFull
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.movara.app.Position
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.CustomZoomButtonsController
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polyline
import java.io.File

@Composable
fun RouteMap(positions: List<Position>, modifier: Modifier = Modifier) {
    var expanded by remember { mutableStateOf(false) }
    Column(modifier.fillMaxWidth()) {
        NativeRouteMap(
            positions,
            Modifier.fillMaxWidth().height(330.dp),
        )
        Button(
            onClick = { expanded = true },
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
        ) {
            Icon(Icons.Rounded.OpenInFull, null)
            Text("Open full-screen map", Modifier.padding(start = 8.dp))
        }
    }
    if (expanded) {
        Dialog(
            onDismissRequest = { expanded = false },
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Surface(Modifier.fillMaxSize().padding(10.dp), shape = RoundedCornerShape(24.dp)) {
                Column {
                    Row(
                        Modifier.fillMaxWidth().padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Route map", style = MaterialTheme.typography.titleLarge)
                        OutlinedButton(onClick = { expanded = false }) { Text("Close") }
                    }
                    NativeRouteMap(positions, Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun NativeRouteMap(positions: List<Position>, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val routeColor = MaterialTheme.colorScheme.primary.toArgb()
    val map = remember {
        Configuration.getInstance().apply {
            userAgentValue = context.packageName
            osmdroidBasePath = File(context.cacheDir, "osmdroid")
            osmdroidTileCache = File(osmdroidBasePath, "tiles")
        }
        MapView(context).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            zoomController.setVisibility(CustomZoomButtonsController.Visibility.SHOW_AND_FADEOUT)
            minZoomLevel = 3.0
            maxZoomLevel = 20.0
        }
    }
    DisposableEffect(map, lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> map.onResume()
                Lifecycle.Event.ON_PAUSE -> map.onPause()
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            map.onPause()
            map.onDetach()
        }
    }
    AndroidView(
        factory = { map },
        update = { view -> view.renderRoute(positions, routeColor) },
        modifier = modifier,
    )
}

private fun MapView.renderRoute(positions: List<Position>, routeColor: Int) {
    overlays.clear()
    if (positions.isEmpty()) {
        invalidate()
        return
    }
    val points = positions.map { GeoPoint(it.latitude, it.longitude) }
    overlays += Polyline().apply {
        setPoints(points)
        outlinePaint.color = routeColor
        outlinePaint.strokeWidth = 10f
    }
    overlays += Marker(this).apply {
        position = points.first()
        title = "Start"
        setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
    }
    if (points.size > 1) {
        overlays += Marker(this).apply {
            position = points.last()
            title = "Finish"
            setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
        }
    }
    val bounds = BoundingBox(
        points.maxOf { it.latitude },
        points.maxOf { it.longitude },
        points.minOf { it.latitude },
        points.minOf { it.longitude },
    )
    post {
        if (points.size == 1) {
            controller.setZoom(16.0)
            controller.setCenter(points.first())
        } else {
            zoomToBoundingBox(bounds, true, 72)
        }
    }
    setBackgroundColor(Color.LTGRAY)
    invalidate()
}
