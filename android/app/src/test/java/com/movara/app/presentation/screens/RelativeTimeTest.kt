package com.movara.app.presentation.screens

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

class RelativeTimeTest {
    private val now = Instant.parse("2026-07-25T12:00:00Z")

    @Test
    fun formatsRecentDeviceReports() {
        assertEquals("Just now", relativeLastSeen("2026-07-25T11:59:40Z", now))
        assertEquals("5 min ago", relativeLastSeen("2026-07-25T11:55:00Z", now))
        assertEquals("2 hr ago", relativeLastSeen("2026-07-25T10:00:00Z", now))
        assertEquals("3 days ago", relativeLastSeen("2026-07-22T12:00:00Z", now))
    }

    @Test
    fun handlesMissingAndMalformedTimestamps() {
        assertEquals("Never", relativeLastSeen(null, now))
        assertEquals("not-a-date", relativeLastSeen("not-a-date", now))
    }
}
