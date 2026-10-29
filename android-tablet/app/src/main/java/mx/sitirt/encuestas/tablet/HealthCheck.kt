package mx.sitirt.encuestas.tablet

import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

/** Confirma que una dirección es un servidor de encuestas llamando a `/api/health`. */
object HealthCheck {
    enum class Result { OK, UNREACHABLE, NOT_SERVER }

    /** [instance] identifica la instalación; null en servidores anteriores a esa función. */
    data class Health(val result: Result, val instance: String? = null)

    private const val TIMEOUT_MS = 8000
    private const val MAX_BODY_CHARS = 4096

    /** Bloquea: llamar fuera del hilo principal. */
    fun check(server: String): Result = probe(server).result

    /** Bloquea: llamar fuera del hilo principal. */
    fun probe(server: String, timeoutMs: Int = TIMEOUT_MS): Health {
        var conn: HttpURLConnection? = null
        return try {
            conn = URL("$server/api/health").openConnection() as HttpURLConnection
            conn.connectTimeout = timeoutMs
            conn.readTimeout = timeoutMs
            conn.useCaches = false
            conn.setRequestProperty("Accept", "application/json")
            if (conn.responseCode != 200) return Health(Result.NOT_SERVER)
            val body = conn.inputStream.bufferedReader().use { reader ->
                val buf = CharArray(MAX_BODY_CHARS)
                val n = reader.read(buf)
                if (n > 0) String(buf, 0, n) else ""
            }
            parse(body)
        } catch (_: Exception) {
            Health(Result.UNREACHABLE)
        } finally {
            conn?.disconnect()
        }
    }

    fun parse(body: String): Health =
        try {
            val json = JSONObject(body)
            if (json.optString("status") != "ok") Health(Result.NOT_SERVER)
            else Health(Result.OK, json.optString("instance").takeIf { it.isNotBlank() && it != "null" })
        } catch (_: Exception) {
            Health(Result.NOT_SERVER)
        }
}
