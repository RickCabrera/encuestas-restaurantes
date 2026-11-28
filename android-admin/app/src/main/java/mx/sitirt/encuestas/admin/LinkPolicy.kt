package mx.sitirt.encuestas.admin

import java.net.URI

/**
 * Qué hacer con cada enlace que se abre en el panel. Sin dependencias de Android para poder
 * probarlo con JUnit.
 */
object LinkPolicy {
    enum class Action {
        /** Se queda dentro de la app (páginas del panel en el mismo servidor). */
        IN_APP,

        /** Se abre en el navegador: otros sitios, la encuesta del comensal y el sitio público. */
        BROWSER,

        /** mailto:, tel:, WhatsApp, etc.: lo abre la app que corresponda del teléfono. */
        EXTERNAL_APP,
    }

    /** Rutas del mismo servidor que no son del panel: se ven mejor en el navegador. */
    private val browserPaths = listOf("/r/", "/kiosk", "/inicio", "/privacidad")

    fun decide(serverUrl: String, url: String): Action {
        val target = runCatching { URI(url) }.getOrNull() ?: return Action.BROWSER
        val scheme = target.scheme?.lowercase() ?: return Action.IN_APP
        when (scheme) {
            "about", "data", "blob", "javascript" -> return Action.IN_APP
            "http", "https" -> Unit
            else -> return Action.EXTERNAL_APP
        }
        val server = runCatching { URI(serverUrl) }.getOrNull() ?: return Action.BROWSER
        val sameServer =
            scheme == server.scheme?.lowercase() &&
                target.host.equals(server.host, ignoreCase = true) &&
                effectivePort(target) == effectivePort(server)
        if (!sameServer) return Action.BROWSER
        val path = target.rawPath.orEmpty().ifEmpty { "/" }
        if (path == "/" || browserPaths.any { path == it.trimEnd('/') || path.startsWith(it) }) return Action.BROWSER
        return Action.IN_APP
    }

    private fun effectivePort(u: URI): Int =
        if (u.port != -1) u.port else if (u.scheme.equals("http", ignoreCase = true)) 80 else 443
}
