package mx.sitirt.encuestas.tablet

import android.os.SystemClock
import java.security.MessageDigest

/** Valida el PIN de la tablet igual que el menú del personal de la web: 5 intentos y 30 s de espera. */
object PinGate {
    private const val MAX_TRIES = 5
    private const val LOCK_MS = 30_000L

    private var tries = 0
    private var lockedUntil = 0L

    /** Debe coincidir con `hashPin` en src/components/kiosk/storage.ts de la app web. */
    fun hash(restaurantId: String, pin: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest("kiosk:$restaurantId:$pin".toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

    /** Segundos que faltan para poder intentar de nuevo; 0 si no está bloqueado. */
    fun lockSeconds(): Int {
        val left = lockedUntil - SystemClock.elapsedRealtime()
        return if (left > 0) ((left + 999) / 1000).toInt() else 0
    }

    fun verify(stored: ServerConfig.Pin, pin: String): Boolean {
        if (lockSeconds() > 0) return false
        if (hash(stored.restaurantId, pin) == stored.hash) {
            tries = 0
            return true
        }
        tries += 1
        if (tries >= MAX_TRIES) {
            tries = 0
            lockedUntil = SystemClock.elapsedRealtime() + LOCK_MS
        }
        return false
    }
}
