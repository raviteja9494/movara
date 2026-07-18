package com.movara.app

object TrackingSync {
    fun flush(store: MovaraStore, api: MovaraApiClient): SyncResult {
        val queued = store.queuedPositions()
        var synced = 0
        var failed = 0
        queued.forEach { point ->
            try {
                api.uploadQueuedPosition(point)
                store.deleteQueuedPosition(point.id)
                synced += 1
            } catch (error: Exception) {
                store.markQueuedPositionError(point.id, error.message ?: "Upload failed")
                failed += 1
            }
        }
        return SyncResult(queued.size, synced, failed)
    }
}
