package mx.sitirt.encuestas.tablet

import android.content.Context
import android.content.SharedPreferences
import java.net.URI

/**
 * Lo que la app guarda por su cuenta: el servidor, el identificador de su instalación y una
 * copia del PIN de la tablet.
 */
object ServerConfig {
    private const val PREFS = "tablet"
    private const val KEY_SERVER = "server"
    private const val KEY_INSTANCE = "server_instance"
    // Dirección anterior del mismo servidor, mientras falta pasar a la nueva lo que guardó la página.
    private const val KEY_MIGRATE_FROM = "migrate_from"
    private const val KEY_PIN_RESTAURANT = "pin_restaurant"
    private const val KEY_PIN_HASH = "pin_hash"

    data class Pin(val restaurantId: String, val hash: String)

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Dirección base sin diagonal final, p. ej. `https://encuestas.sitirt.mx`. */
    fun server(context: Context): String? = prefs(context).getString(KEY_SERVER, null)

    /** Identificador de la instalación del servidor (de `/api/health`); null si no se conoce. */
    fun instance(context: Context): String? = prefs(context).getString(KEY_INSTANCE, null)

    fun setInstance(context: Context, instance: String?) {
        val e = prefs(context).edit()
        if (instance == null) e.remove(KEY_INSTANCE) else e.putString(KEY_INSTANCE, instance)
        e.apply()
    }

    /**
     * Guarda la dirección escrita en "Dirección del servidor". Si responde con el mismo
     * identificador que el servidor actual, es el mismo servidor con otra IP: se conserva la
     * vinculación (ver [relocate]). Si no, es otro servidor y se empieza de cero.
     */
    fun setServer(context: Context, url: String, instance: String? = null) {
        val current = server(context)
        if (url == current) {
            if (instance != null) setInstance(context, instance)
            return
        }
        if (current != null && instance != null && instance == instance(context)) {
            relocate(context, url)
            return
        }
        // El PIN guardado es del restaurante vinculado en el servidor anterior.
        val e = prefs(context).edit()
            .putString(KEY_SERVER, url)
            .remove(KEY_PIN_RESTAURANT)
            .remove(KEY_PIN_HASH)
            .remove(KEY_MIGRATE_FROM)
        if (instance == null) e.remove(KEY_INSTANCE) else e.putString(KEY_INSTANCE, instance)
        e.commit()
    }

    /**
     * El mismo servidor cambió de dirección: se guarda la nueva conservando el PIN y el
     * identificador, y se anota la anterior para pasar la vinculación y las respuestas
     * pendientes que la página guardó allí (MainActivity, StorageMigrator).
     */
    fun relocate(context: Context, url: String) {
        val current = server(context) ?: return
        if (url == current) return
        // Si ya había una mudanza sin terminar, lo guardado sigue en la dirección de origen.
        val from = migrateFrom(context) ?: current
        val e = prefs(context).edit().putString(KEY_SERVER, url)
        if (from == url) e.remove(KEY_MIGRATE_FROM) else e.putString(KEY_MIGRATE_FROM, from)
        e.commit()
    }

    fun migrateFrom(context: Context): String? = prefs(context).getString(KEY_MIGRATE_FROM, null)

    fun clearMigrateFrom(context: Context) {
        prefs(context).edit().remove(KEY_MIGRATE_FROM).commit()
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
