package mx.sitirt.encuestas.tablet

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ServerFinderTest {
    @Test
    fun `solo se busca un servidor en IP de red local`() {
        assertTrue(ServerFinder.searchable("http://192.168.0.101:3000"))
        assertTrue(ServerFinder.searchable("http://10.0.0.5:3000"))
        assertTrue(ServerFinder.searchable("http://172.16.4.2:3000"))
        assertFalse(ServerFinder.searchable("https://encuestas.sitirt.mx"))
        assertFalse(ServerFinder.searchable("http://8.8.8.8:3000"))
        assertFalse(ServerFinder.searchable("http://172.32.0.1:3000"))
        assertFalse(ServerFinder.searchable("no es una dirección"))
    }

    @Test
    fun `revisa la misma red y puerto, empezando junto a la IP anterior`() {
        val t = ServerFinder.targets("http://192.168.0.101:3000", listOf("192.168.0.57"))
        // 254 direcciones menos la anterior y la de la tablet.
        assertEquals(252, t.size)
        assertEquals(listOf("192.168.0.100", "192.168.0.102"), t.take(2).map { it.ip }.sorted())
        assertTrue(t.all { it.port == 3000 && it.scheme == "http" })
        assertFalse(t.any { it.ip == "192.168.0.101" || it.ip == "192.168.0.57" })
        assertEquals("http://192.168.0.100:3000", t.first { it.ip == "192.168.0.100" }.url)
    }

    @Test
    fun `si la tablet quedó en otra red tambien revisa esa`() {
        val t = ServerFinder.targets("http://192.168.0.101:3000", listOf("192.168.1.20", "fe80::1"))
        assertEquals(254 - 1 + 254 - 1, t.size)
        assertTrue(t.any { it.ip == "192.168.1.100" })
        // Primero la red anterior.
        assertTrue(t.first().ip.startsWith("192.168.0."))
    }

    @Test
    fun `nada que revisar para un servidor en internet`() {
        assertTrue(ServerFinder.targets("https://encuestas.sitirt.mx", listOf("192.168.0.57")).isEmpty())
    }
}
