package com.movara.app.presentation.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

@Immutable
data class MovaraSpacing(
    val xSmall: Dp = 4.dp,
    val small: Dp = 8.dp,
    val medium: Dp = 16.dp,
    val large: Dp = 24.dp,
    val xLarge: Dp = 32.dp,
)

@Immutable
data class MovaraRadii(
    val chip: Dp = 12.dp,
    val card: Dp = 24.dp,
    val hero: Dp = 32.dp,
)

internal val LocalMovaraSpacing = staticCompositionLocalOf { MovaraSpacing() }
internal val LocalMovaraRadii = staticCompositionLocalOf { MovaraRadii() }

object MovaraThemeTokens {
    val spacing: MovaraSpacing
        @Composable get() = LocalMovaraSpacing.current
    val radii: MovaraRadii
        @Composable get() = LocalMovaraRadii.current
}
