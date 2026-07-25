package com.movara.app.presentation.components

import android.webkit.WebView
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.movara.app.Position
import com.movara.app.TripMapDialog

@Composable
fun RouteMap(positions: List<Position>, modifier: Modifier = Modifier) {
    key(positions.hashCode()) {
        var webView: WebView? = null
        AndroidView(
            factory = { context ->
                TripMapDialog.webView(context, positions).also { webView = it }
            },
            modifier = modifier.fillMaxWidth().height(330.dp).clip(RoundedCornerShape(24.dp)),
        )
        DisposableEffect(Unit) {
            onDispose {
                webView?.stopLoading()
                webView?.destroy()
            }
        }
    }
}
