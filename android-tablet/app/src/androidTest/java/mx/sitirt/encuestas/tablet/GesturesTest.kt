package mx.sitirt.encuestas.tablet

import android.app.ActivityManager
import android.app.KeyguardManager
import android.content.Context
import android.os.SystemClock
import android.view.InputDevice
import android.view.MotionEvent
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import java.net.ServerSocket
import java.util.regex.Pattern
import kotlin.concurrent.thread
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Los dos gestos (menú del personal de la web y menú de la app) deben funcionar siempre, con la
 * pantalla fijada o sin fijar, y el menú de la app nunca debe quedar inalcanzable.
 *
 * Corre en un emulador o tablet: `./gradlew connectedDebugAndroidTest` (ver docs/TABLET-APK.md).
 * La página del kiosko la sirve la propia prueba, con la misma esquina de 3 s que la web real.
 */
@RunWith(AndroidJUnit4::class)
class GesturesTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context: Context = instrumentation.targetContext
    private val device = UiDevice.getInstance(instrumentation)
    private lateinit var server: ServerSocket
    private var scenario: ActivityScenario<MainActivity>? = null

    @Before
    fun setUp() {
        shell("am task lock stop")
        // Al desfijar, Android puede dejar el equipo en su pantalla de bloqueo.
        shell("input keyevent KEYCODE_WAKEUP")
        shell("wm dismiss-keyguard")
        waitUntil("se quitó la pantalla de bloqueo") { !context.getSystemService(KeyguardManager::class.java).isKeyguardLocked }
        device.pressHome()
        device.waitForIdle()
        server = ServerSocket(0)
        thread(isDaemon = true) {
            while (!server.isClosed) {
                try {
                    server.accept().use { socket ->
                        socket.getInputStream().read(ByteArray(8192))
                        val body = PAGE.toByteArray()
                        val head = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n" +
                            "Content-Length: ${body.size}\r\nConnection: close\r\n\r\n"
                        socket.getOutputStream().apply {
                            write(head.toByteArray())
                            write(body)
                            flush()
                        }
                    }
                } catch (_: Exception) {
                    // El socket se cerró al terminar la prueba.
                }
            }
        }
        prefs().edit().clear().putString("server", "http://127.0.0.1:${server.localPort}").commit()
    }

    @After
    fun tearDown() {
        // Primero se desfija: Android no deja cerrar una pantalla fijada.
        shell("am task lock stop")
        waitUntil("la pantalla quedó sin fijar") { lockState() == ActivityManager.LOCK_TASK_MODE_NONE }
        scenario?.close()
        server.close()
        prefs().edit().clear().commit()
    }

    @Test
    fun sinFijar_funcionanLosDosGestos() {
        launch()
        assertBothGesturesWork()
    }

    @Test
    fun conLaPantallaFijada_funcionanLosDosGestos() {
        val activity = launch()
        // Fija la tarea como lo hace Android al aceptar su aviso, sin depender de tocarlo.
        shell("am task lock ${activity.taskId}")
        waitUntil("la pantalla quedó fijada") { lockState() != ActivityManager.LOCK_TASK_MODE_NONE }
        assertBothGesturesWork()
    }

    @Test
    fun trasDesfijarYVolverALaApp_elMenuSigueAbriendo() {
        // Lo que falló en campo: bloqueo guardado, alguien desfija con el gesto de Android y vuelve.
        prefs().edit().putBoolean("screen_lock", true).commit()
        launch()
        val decline = device.wait(Until.findObject(By.text(NO_THANKS)), 5000)
        assertNotNull("Android debió mostrar su aviso para fijar la pantalla", decline)

        // Con el aviso abierto, el menú no se muestra debajo: espera.
        holdBothCorners()
        assertFalse(device.wait(Until.hasObject(By.text(MENU_TITLE)), 1500))

        // "No, gracias": el menú que quedó pendiente abre al primer toque en la app...
        decline.click()
        device.wait(Until.gone(By.text(NO_THANKS)), 3000)
        device.click(device.displayWidth / 2, device.displayHeight / 2)
        assertTrue("el menú de la app debe abrir al cerrarse el aviso", device.wait(Until.hasObject(By.text(MENU_TITLE)), 3000))
        closeMenu()

        // ...y el aviso no vuelve a salir al regresar a primer plano.
        assertFalse(prefs().getBoolean("screen_lock", true))
        device.pressHome()
        scenario?.close()
        launch()
        assertFalse(device.wait(Until.hasObject(By.text(NO_THANKS)), 2500))
        assertBothGesturesWork()
    }

    // ───────── Apoyo ─────────

    private fun assertBothGesturesWork() {
        assertTrue("la página de prueba debe cargar", device.wait(Until.hasObject(By.text("kiosko de prueba")), 10_000))

        // Menú del personal de la web: un dedo en la esquina superior izquierda, 3 s.
        hold(3600, corner(left = true))
        assertTrue(
            "el gesto del menú del personal debe llegar a la página",
            device.wait(Until.hasObject(By.text(STAFF_MENU)), 3000),
        )

        // Menú de la app: un dedo en cada esquina superior, 5 s. La página no debe abrir el suyo.
        holdBothCorners()
        assertTrue("el menú de la app debe abrir", device.wait(Until.hasObject(By.text(MENU_TITLE)), 3000))
        closeMenu()
        // Al cerrarse el diálogo, el contenido del WebView tarda un momento en volver a leerse.
        device.wait(Until.hasObject(By.text(STAFF_MENU)), 5000)
        assertEquals(
            "el gesto de dos esquinas no debe abrir también el menú de la web",
            1,
            device.findObjects(By.text(STAFF_MENU)).size,
        )
    }

    private fun closeMenu() {
        device.findObject(By.text(Pattern.compile("cerrar", Pattern.CASE_INSENSITIVE))).click()
        device.wait(Until.gone(By.text(MENU_TITLE)), 3000)
    }

    private fun launch(): MainActivity {
        val s = ActivityScenario.launch(MainActivity::class.java)
        scenario = s
        lateinit var activity: MainActivity
        s.onActivity { activity = it }
        return activity
    }

    private fun prefs() = context.getSharedPreferences("tablet", Context.MODE_PRIVATE)

    private fun lockState() = context.getSystemService(ActivityManager::class.java).lockTaskModeState

    private fun shell(command: String) {
        instrumentation.uiAutomation.executeShellCommand(command).close()
        SystemClock.sleep(300)
    }

    private fun waitUntil(what: String, condition: () -> Boolean) {
        val end = SystemClock.uptimeMillis() + 5000
        while (!condition()) {
            if (SystemClock.uptimeMillis() > end) throw AssertionError("No pasó: $what")
            SystemClock.sleep(100)
        }
    }

    /** Un punto dentro de la esquina, pegado al borde superior (donde quedan las barras del sistema). */
    private fun corner(left: Boolean): Pair<Float, Float> {
        val inset = 24 * context.resources.displayMetrics.density
        return (if (left) inset else device.displayWidth - inset) to inset
    }

    private fun holdBothCorners() = hold(CornerHold.HOLD_MS + 600, corner(left = true), corner(left = false))

    /**
     * Mantiene uno o dos dedos quietos. Como un dedo real, manda movimientos mínimos todo el
     * rato: es lo que hace que el WebView se quiera quedar con el toque.
     */
    private fun hold(ms: Long, vararg fingers: Pair<Float, Float>) {
        val down = SystemClock.uptimeMillis()
        fun send(action: Int, count: Int, jitter: Float = 0f) {
            val props = Array(count) {
                MotionEvent.PointerProperties().apply {
                    id = it
                    toolType = MotionEvent.TOOL_TYPE_FINGER
                }
            }
            val coords = Array(count) {
                MotionEvent.PointerCoords().apply {
                    x = fingers[it].first + jitter
                    y = fingers[it].second + jitter
                    pressure = 1f
                    size = 1f
                }
            }
            val ev = MotionEvent.obtain(
                down, SystemClock.uptimeMillis(), action, count, props, coords,
                0, 0, 1f, 1f, 0, 0, InputDevice.SOURCE_TOUCHSCREEN, 0,
            )
            instrumentation.uiAutomation.injectInputEvent(ev, true)
            ev.recycle()
        }
        send(MotionEvent.ACTION_DOWN, 1)
        for (i in 1 until fingers.size) {
            send(MotionEvent.ACTION_POINTER_DOWN or (i shl MotionEvent.ACTION_POINTER_INDEX_SHIFT), i + 1)
        }
        val end = SystemClock.uptimeMillis() + ms
        var step = 0
        while (SystemClock.uptimeMillis() < end) {
            SystemClock.sleep(100)
            send(MotionEvent.ACTION_MOVE, fingers.size, jitter = (step++ % 3).toFloat())
        }
        for (i in fingers.size - 1 downTo 1) {
            send(MotionEvent.ACTION_POINTER_UP or (i shl MotionEvent.ACTION_POINTER_INDEX_SHIFT), i + 1)
        }
        send(MotionEvent.ACTION_UP, 1)
    }

    private companion object {
        const val MENU_TITLE = "Menú de la app"
        const val STAFF_MENU = "MENU DEL PERSONAL"
        val NO_THANKS: Pattern = Pattern.compile("No,? (thanks|gracias)", Pattern.CASE_INSENSITIVE)

        /** Misma mecánica que SecretCorner en src/components/kiosk/kiosk-app.tsx: 80 px, 3 s. */
        const val PAGE = """<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%}#c{position:absolute;top:0;left:0;width:80px;height:80px}#o{padding:140px 20px}</style></head>
<body><div id="c"></div><div id="o"><p>kiosko de prueba</p></div><script>
var t=null,c=document.getElementById("c");
function cancel(){if(t)clearTimeout(t);t=null;}
c.addEventListener("pointerdown",function(){cancel();t=setTimeout(function(){
  var p=document.createElement("p");p.textContent="MENU DEL PERSONAL";document.getElementById("o").appendChild(p);},3000);});
c.addEventListener("pointerup",cancel);c.addEventListener("pointerleave",cancel);c.addEventListener("pointercancel",cancel);
c.addEventListener("contextmenu",function(e){e.preventDefault();});
</script></body></html>"""
    }
}
