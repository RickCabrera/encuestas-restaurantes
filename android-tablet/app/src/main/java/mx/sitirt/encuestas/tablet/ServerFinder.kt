package mx.sitirt.encuestas.tablet

import java.net.InetSocketAddress
import java.net.Socket
import java.net.URI
import java.util.concurrent.ExecutorCompletionService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Vuelve a encontrar el servidor cuando la PC cambia de IP (el router le dio otra por DHCP).
 *
 * Solo para servidores en la red local (`http://192.168.x.x:3000`, la versión instalada en PC).
 * Revisa las direcciones de la misma red, en el mismo puerto, y acepta solo la que responde en
 * `/api/health` con el mismo identificador de instalación que la tablet guardó: así nunca se
 * conecta a otro servidor de encuestas que esté en la misma red.
 */
object ServerFinder {
    private const val CONNECT_MS = 350
    private const val HEALTH_MS = 2500
    private const val THREADS = 32
    private const val TOTAL_MS = 30_000L

    data class Target(val scheme: String, val ip: String, val port: Int) {
        val url: String get() = "$scheme://$ip:$port"
    }

    /** true si la dirección es una IP privada (red local), que es la que puede cambiar. */
    fun searchable(server: String): Boolean = parse(server) != null

    /**
     * Direcciones a revisar: la /24 de la dirección anterior y la /24 de cada IP de la tablet,
     * sin la anterior ni las de la tablet. Primero las más cercanas a la anterior, porque el
     * router suele dar una IP cercana.
     */
    fun targets(server: String, ownAddresses: List<String>): List<Target> {
        val old = parse(server) ?: return emptyList()
        val own = ownAddresses.mapNotNull(::octets).filter(::isPrivate)
        val skip = (own.map(::join) + old.ip).toSet()
        val oldOctets = octets(old.ip)!!
        val prefixes = LinkedHashSet<String>()
        prefixes += prefix(oldOctets)
        own.forEach { prefixes += prefix(it) }

        val result = ArrayList<Target>()
        for (p in prefixes) {
            val hosts = (1..254).toMutableList()
            if (p == prefix(oldOctets)) hosts.sortBy { Math.abs(it - oldOctets[3]) }
            for (h in hosts) {
                val ip = "$p.$h"
                if (ip !in skip) result += Target(old.scheme, ip, old.port)
            }
        }
        return result
    }

    /**
     * Bloquea (hasta unos segundos): llamar fuera del hilo principal. Devuelve la dirección
     * nueva del servidor con ese [instance], o null si no está en la red.
     */
    fun find(server: String, instance: String, ownAddresses: List<String>): String? {
        val list = targets(server, ownAddresses)
        if (list.isEmpty()) return null
        val pool = Executors.newFixedThreadPool(THREADS)
        try {
            val done = ExecutorCompletionService<String?>(pool)
            list.forEach { t -> done.submit { if (matches(t, instance)) t.url else null } }
            val deadline = System.currentTimeMillis() + TOTAL_MS
            repeat(list.size) {
                val left = deadline - System.currentTimeMillis()
                if (left <= 0) return null
                val next = done.poll(left, TimeUnit.MILLISECONDS) ?: return null
                val found = try {
                    next.get()
                } catch (_: Exception) {
                    null
                }
                if (found != null) return found
            }
            return null
        } finally {
            pool.shutdownNow()
        }
    }

    private fun matches(t: Target, instance: String): Boolean {
        if (Thread.currentThread().isInterrupted) return false
        // Primero un intento de conexión corto: casi todas las direcciones no tienen nada.
        try {
            Socket().use { it.connect(InetSocketAddress(t.ip, t.port), CONNECT_MS) }
        } catch (_: Exception) {
            return false
        }
        val health = HealthCheck.probe(t.url, HEALTH_MS)
        return health.result == HealthCheck.Result.OK && health.instance == instance
    }

    private fun parse(server: String): Target? =
        try {
            val uri = URI(server)
            val scheme = uri.scheme?.lowercase()
            val host = uri.host
            val o = host?.let(::octets)
            if ((scheme != "http" && scheme != "https") || o == null || !isPrivate(o)) null
            else Target(scheme, host, if (uri.port == -1) (if (scheme == "https") 443 else 80) else uri.port)
        } catch (_: Exception) {
            null
        }

    private fun octets(ip: String): IntArray? {
        val parts = ip.split(".")
        if (parts.size != 4) return null
        val n = parts.map { it.toIntOrNull() ?: return null }
        if (n.any { it !in 0..255 }) return null
        return n.toIntArray()
    }

    private fun isPrivate(o: IntArray) =
        o[0] == 10 || (o[0] == 172 && o[1] in 16..31) || (o[0] == 192 && o[1] == 168)

    private fun prefix(o: IntArray) = "${o[0]}.${o[1]}.${o[2]}"

    private fun join(o: IntArray) = o.joinToString(".")
}
