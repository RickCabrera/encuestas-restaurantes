package mx.sitirt.encuestas.tablet

import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

/** Confirma que una dirección es un servidor de encuestas llamando a `/api/health`. */
object HealthCheck {
    enum class Result { OK, UNREACHABLE, NOT_SERVER }

    private const val TIMEOUT_MS = 8000
    private const val MAX_BODY_CHARS = 4096

    /** Bloquea: llamar fuera del hilo principal. */
    fun check(server: String): Result {
        var conn: HttpURLConnection? = null
        return try {
            conn = URL("$server/api/health").openConnection() as HttpURLConnection
            conn.connectTimeout = TIMEOUT_MS
            conn.readTimeout = TIMEOUT_MS
            conn.useCaches = false
            conn.setRequestProperty("Accept", "application/json")
            if (conn.responseCode != 200) return Result.NOT_SERVER
            val body = conn.inputStream.bufferedReader().use { reader ->
                val buf = CharArray(MAX_BODY_CHARS)
                val n = reader.read(buf)
                if (n > 0) String(buf, 0, n) else ""
            }
            val ok = try {
                JSONObject(body).optString("status") == "ok"
            } catch (_: Exception) {
                false
            }
            if (ok) Result.OK else Result.NOT_SERVER
        } catch (_: Exception) {
            Result.UNREACHABLE
        } finally {
            conn?.disconnect()
        }
    }
}
