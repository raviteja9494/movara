package com.movara.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.view.View
import kotlin.math.max

class RouteMapView(context: Context) : View(context) {
    var positions: List<Position> = emptyList()
        set(value) {
            field = value
            invalidate()
        }

    private val routePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xff2563eb.toInt()
        strokeWidth = 7f
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val pointPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xff10b981.toInt()
        style = Paint.Style.FILL
    }
    private val gridPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xffdbeafe.toInt()
        strokeWidth = 2f
        style = Paint.Style.STROKE
    }
    private val emptyPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xff64748b.toInt()
        textSize = 34f
        textAlign = Paint.Align.CENTER
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        canvas.drawColor(0xffeff6ff.toInt())
        val w = width.toFloat()
        val h = height.toFloat()
        for (i in 1..3) {
            canvas.drawLine(w * i / 4f, 0f, w * i / 4f, h, gridPaint)
            canvas.drawLine(0f, h * i / 4f, w, h * i / 4f, gridPaint)
        }
        if (positions.size < 2) {
            canvas.drawText("No route points", w / 2f, h / 2f, emptyPaint)
            return
        }
        val minLat = positions.minOf { it.latitude }
        val maxLat = positions.maxOf { it.latitude }
        val minLon = positions.minOf { it.longitude }
        val maxLon = positions.maxOf { it.longitude }
        val latSpan = max(0.00001, maxLat - minLat)
        val lonSpan = max(0.00001, maxLon - minLon)
        val pad = 28f
        fun x(lon: Double) = (pad + ((lon - minLon) / lonSpan) * (w - pad * 2)).toFloat()
        fun y(lat: Double) = (h - pad - ((lat - minLat) / latSpan) * (h - pad * 2)).toFloat()

        val path = Path()
        positions.forEachIndexed { index, p ->
            if (index == 0) path.moveTo(x(p.longitude), y(p.latitude)) else path.lineTo(x(p.longitude), y(p.latitude))
        }
        canvas.drawPath(path, routePaint)
        val first = positions.first()
        val last = positions.last()
        canvas.drawCircle(x(first.longitude), y(first.latitude), 11f, pointPaint)
        pointPaint.color = 0xffef4444.toInt()
        canvas.drawCircle(x(last.longitude), y(last.latitude), 11f, pointPaint)
        pointPaint.color = 0xff10b981.toInt()
    }
}
