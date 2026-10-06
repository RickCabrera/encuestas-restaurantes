package mx.sitirt.encuestas.tablet

import android.content.Context
import android.content.SharedPreferences
import java.net.URI

/** Lo que la app guarda por su cuenta: el servidor y una copia del PIN de la tablet. */
object ServerConfig {
    private const val PREFS = "tablet"
    private const val KEY_SERVER = "server"
    private const val KEY_PIN_RESTAURANT = "pin_restaurant"
    private const val KEY_PIN_HASH = "pin_hash"

    data class Pin(val restaurantId: String, val hash: String)

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Dirección base sin diagonal final, p. ej. `https://encuestas.sitirt.mx`. */
    fun server(context: Context): String? = prefs(context).getString(KEY_SERVER, null)

    fun setServer(context: Context, url: String) {
        if (url == server(context)) return
        // El PIN guardado es del restaurante vinculado en el servidor anterior.
        prefs(context).edit()
            .putString(KEY_SERVER, url)
            .remove(KEY_PIN_RESTAURANT)
            .remove(KEY_PIN_HASH)
            .apply()
    }

    fun pin(context: Context): Pin? {
        val p = prefs(context)
        val id = p.getString(KEY_PIN_RESTAURANT, null) ?: return null
        val hash = p.getString(KEY_PIN_HASH, null) ?: return null
        return Pin(id, hash)
    }

    fun setPin(context: Context, pin: Pin?) {
        val e = prefs(context).edit()
        if (pin == null) e.remove(KEY_PIN_RESTAURANT).remove(KEY_PIN_HASH)
        else e.putString(KEY_PIN_RESTAURANT, pin.restaurantId).putString(KEY_PIN_HASH, pin.hash)
        e.apply()
    }

    fun kioskUrl(server: String) = "$server/kiosk"

    /**
     * Direcciones a probar para lo que escribió la persona, ya normalizadas (solo esquema,
     * host y puerto). Sin esquema se prueba https y luego http. Con `http://` se prueba después
     * https, por si el servidor redirige (la comprobación no sigue redirecciones entre esquemas).
     * Vacío si no es una dirección.
     */
    fun candidates(input: String): List<String> {
        val text = input.trim()
        if (text.isEmpty()) return emptyList()
        val withScheme = when {
            text.startsWith("https://", ignoreCase = true) -> listOf(text)
            text.startsWith("http://", ignoreCase = true) -> listOf(text, "https://" + text.substring(7))
            text.contains("://") -> return emptyList()
            else -> listOf("https://$text", "http://$text")
        }
        return withScheme.mapNotNull(::normalize)
    }

    private fun normalize(url: String): String? =
        try {
            val uri = URI(url)
            val scheme = uri.scheme?.lowercase()
            val host = uri.host?.lowercase()
            if (host.isNullOrEmpty() || (scheme != "http" && scheme != "https")) null
            else if (uri.port == -1) "$scheme://$host"
            else "$scheme://$host:${uri.port}"
        } catch (_: Exception) {
            null
        }
}
