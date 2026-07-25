package com.movara.app.presentation.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary = Pine,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD0F3E8),
    onPrimaryContainer = Ink,
    secondary = Ocean,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFDCE7FF),
    onSecondaryContainer = Ink,
    tertiary = Amber,
    onTertiary = Color.White,
    background = Dawn,
    onBackground = Ink,
    surface = DawnSurface,
    onSurface = Ink,
    surfaceVariant = DawnSurfaceHigh,
    onSurfaceVariant = Muted,
    outline = Outline,
    error = Rose,
)

private val DarkColors = darkColorScheme(
    primary = PineBright,
    onPrimary = Night,
    primaryContainer = Color(0xFF164E46),
    onPrimaryContainer = NightText,
    secondary = Color(0xFF9DBBFF),
    onSecondary = Night,
    secondaryContainer = Color(0xFF23375F),
    onSecondaryContainer = NightText,
    tertiary = Color(0xFFFFB86A),
    onTertiary = Night,
    background = Night,
    onBackground = NightText,
    surface = NightSurface,
    onSurface = NightText,
    surfaceVariant = NightSurfaceHigh,
    onSurfaceVariant = NightMuted,
    outline = NightOutline,
    error = Color(0xFFFFB4AB),
)

@Composable
fun MovaraTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    CompositionLocalProvider(
        LocalMovaraSpacing provides MovaraSpacing(),
        LocalMovaraRadii provides MovaraRadii(),
    ) {
        MaterialTheme(
            colorScheme = if (darkTheme) DarkColors else LightColors,
            typography = MovaraTypography,
            content = content,
        )
    }
}
