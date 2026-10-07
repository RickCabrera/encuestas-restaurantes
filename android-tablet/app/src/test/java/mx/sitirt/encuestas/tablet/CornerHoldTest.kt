package mx.sitirt.encuestas.tablet

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CornerHoldTest {
    private val width = 1280f
    private val zone = 144f

    private fun both(vararg points: Pair<Float, Float>, skip: Int = -1) =
        CornerHold.bothCorners(
            FloatArray(points.size) { points[it].first },
            FloatArray(points.size) { points[it].second },
            skip,
            width,
            zone,
        )

    @Test
    fun `un dedo en cada esquina superior es el gesto`() {
        assertTrue(both(20f to 20f, 1260f to 20f))
        // El orden de los dedos no importa, ni que haya un tercero en otra parte.
        assertTrue(both(1260f to 100f, 100f to 100f))
        assertTrue(both(640f to 500f, 20f to 20f, 1260f to 20f))
    }

    @Test
    fun `tambien justo en el borde de la pantalla, donde quedan las barras del sistema`() {
        assertTrue(both(0f to 0f, 1279f to 0f))
    }

    @Test
    fun `un solo dedo, o dos en la misma esquina, no lo son`() {
        assertFalse(both(20f to 20f))
        assertFalse(both(1260f to 20f))
        assertFalse(both(20f to 20f, 60f to 40f))
        assertFalse(both())
    }

    @Test
    fun `fuera de las esquinas no cuenta`() {
        assertFalse(both(20f to 200f, 1260f to 20f))
        assertFalse(both(20f to 20f, 1000f to 20f))
        assertFalse(both(20f to 700f, 1260f to 700f))
    }

    @Test
    fun `el dedo que se esta levantando ya no cuenta`() {
        assertFalse(both(20f to 20f, 1260f to 20f, skip = 1))
        assertFalse(both(20f to 20f, 1260f to 20f, skip = 0))
        assertTrue(both(640f to 500f, 20f to 20f, 1260f to 20f, skip = 0))
    }

    @Test
    fun `en una pantalla mas angosta que dos zonas un dedo no vale por las dos esquinas`() {
        assertFalse(CornerHold.bothCorners(floatArrayOf(100f), floatArrayOf(20f), -1, 200f, zone))
        assertTrue(CornerHold.bothCorners(floatArrayOf(10f, 190f), floatArrayOf(20f, 20f), -1, 200f, zone))
    }
}
