package com.movara.app.presentation.screens

import com.movara.app.FuelRecord
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FuelMileageTest {
    @Test
    fun calculatesMileageInDateOrder() {
        val records = listOf(
            fuel("new", "2026-02-01", 1_250.0, 25.0),
            fuel("old", "2026-01-01", 1_000.0, 20.0),
        )

        val result = calculateMileage(records)

        assertEquals(1, result.size)
        assertEquals(250.0, result.single().distanceKm, 0.001)
        assertEquals(10.0, result.single().kmPerLitre, 0.001)
    }

    @Test
    fun ignoresInvalidOdometerIntervalsAndWeightsAverageByFuel() {
        val records = listOf(
            fuel("a", "2026-01-01", 1_000.0, 10.0),
            fuel("b", "2026-02-01", 1_200.0, 20.0),
            fuel("rollback", "2026-03-01", 900.0, 30.0),
            fuel("c", "2026-04-01", 1_200.0, 30.0),
        )

        val result = calculateMileage(records)

        assertEquals(2, result.size)
        assertEquals(10.0, result[0].kmPerLitre, 0.001)
        assertEquals(10.0, result[1].kmPerLitre, 0.001)
        assertEquals(10.0, averageMileage(result)!!, 0.001)
        assertNull(averageMileage(emptyList()))
    }

    private fun fuel(id: String, date: String, odometer: Double, quantity: Double) = FuelRecord(
        id = id,
        vehicleId = "vehicle",
        vehicleName = "Car",
        date = date,
        odometer = odometer,
        fuelQuantity = quantity,
        fuelCost = null,
        fuelRate = null,
        latitude = null,
        longitude = null,
    )
}
