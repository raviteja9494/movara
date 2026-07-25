package com.movara.app.presentation.components

import android.webkit.WebView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.movara.app.Position
import com.movara.app.TripMapDialog

@Composable
fun RouteMap(positions: List<Position>, modifier: Modifier = Modifier) {
    var expanded by remember { mutableStateOf(false) }
    val routeColor = MaterialTheme.colorScheme.primary
    val startColor = MaterialTheme.colorScheme.tertiary
    val endColor = MaterialTheme.colorScheme.error
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(24.dp))
            .background(MaterialTheme.colorScheme.surfaceContainer),
    ) {
        Canvas(Modifier.fillMaxWidth().height(240.dp).padding(18.dp)) {
            if (positions.isEmpty()) return@Canvas
            val minLat = positions.minOf { it.latitude }
            val maxLat = positions.maxOf { it.latitude }
            val minLon = positions.minOf { it.longitude }
            val maxLon = positions.maxOf { it.longitude }
            val latSpan = (maxLat - minLat).takeIf { it > 0 } ?: 0.001
            val lonSpan = (maxLon - minLon).takeIf { it > 0 } ?: 0.001
            fun point(position: Position) = Offset(
                x = ((position.longitude - minLon) / lonSpan * size.width).toFloat(),
                y = (size.height - (position.latitude - minLat) / latSpan * size.height).toFloat(),
            )
            val path = Path()
            positions.forEachIndexed { index, position ->
                val offset = point(position)
                if (index == 0) path.moveTo(offset.x, offset.y) else path.lineTo(offset.x, offset.y)
            }
            drawPath(path, routeColor, style = Stroke(width = 8f, cap = StrokeCap.Round))
            drawCircle(startColor, radius = 13f, center = point(positions.first()))
            drawCircle(endColor, radius = 13f, center = point(positions.last()))
        }
        Button(
            onClick = { expanded = true },
            modifier = Modifier.fillMaxWidth().padding(12.dp),
        ) {
            Icon(Icons.Rounded.OpenInFull, null)
            Text("Open interactive map", Modifier.padding(start = 8.dp))
        }
    }
    if (expanded) {
        Dialog(
            onDismissRequest = { expanded = false },
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Surface(Modifier.fillMaxSize().padding(12.dp), shape = RoundedCornerShape(24.dp)) {
                Column {
                    Row(
                        Modifier.fillMaxWidth().padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Route map", style = MaterialTheme.typography.titleLarge)
                        OutlinedButton(onClick = { expanded = false }) { Text("Close") }
                    }
                    InteractiveRouteMap(positions, Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun InteractiveRouteMap(positions: List<Position>, modifier: Modifier = Modifier) {
    key(positions.hashCode()) {
        var webView: WebView? = null
        Box(modifier) {
            AndroidView(
                factory = { context ->
                    TripMapDialog.webView(context, positions).also { webView = it }
                },
                modifier = Modifier.fillMaxSize(),
            )
        }
        DisposableEffect(Unit) {
            onDispose {
                webView?.stopLoading()
                webView?.destroy()
            }
        }
    }
}
