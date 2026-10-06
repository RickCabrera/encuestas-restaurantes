package mx.sitirt.encuestas.tablet

import android.content.Context

/**
 * Si el personal pidió fijar la pantalla desde el menú de la app (bloqueo sin "device owner",
 * ver docs/TABLET-APK.md). No depende del servidor: se conserva al cambiarlo.
 */
object ScreenLock {
    private const val PREFS = "tablet"
    private const val KEY_WANTED = "screen_lock"

    fun wanted(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_WANTED, false)

    fun setWanted(context: Context, wanted: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_WANTED, wanted).apply()
    }
}
