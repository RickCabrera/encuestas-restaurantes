package mx.sitirt.encuestas.tablet

import android.content.Context
import android.util.AttributeSet
import android.view.MotionEvent
import android.widget.FrameLayout

/**
 * Detecta el gesto de la app: un dedo en cada esquina superior durante 5 s.
 *
 * Los toques se miran en [dispatchTouchEvent], antes de repartirlos: así el gesto no depende de
 * lo que haga el WebView con ellos (un hijo puede pedir que no le intercepten el toque, y
 * entonces `onInterceptTouchEvent` deja de llamarse).
 *
 * La esquina superior izquierda también es la del menú del personal de la web (3 s). En cuanto
 * hay un dedo en cada esquina, este contenedor se queda con el gesto y le manda un "cancel" al
 * WebView, así que el temporizador de la web se detiene y no se abren los dos menús.
 */
class CornerHoldLayout @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : FrameLayout(context, attrs) {

    var onTrigger: (() -> Unit)? = null

    /** Cada toque que llega a la app, antes de repartirlo. */
    var onTouch: ((MotionEvent) -> Unit)? = null

    /**
     * Si devuelve true al empezar un toque, ese toque no se reparte a los hijos (el gesto de la
     * app sí se sigue detectando). Es para cuando algo del sistema tapa la pantalla: lo que la
     * página abriera quedaría debajo, sin poder tocarse.
     */
    var blockChildren: (() -> Boolean)? = null

    private val zone = CornerHold.ZONE_DP * resources.displayMetrics.density
    private var holding = false
    // El gesto ya se le quitó a los hijos; sigue así hasta que se levantan todos los dedos.
    private var swallowing = false
    private val fire = Runnable { onTrigger?.invoke() }

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        onTouch?.invoke(ev)
        track(ev)
        if (ev.actionMasked == MotionEvent.ACTION_DOWN && blockChildren?.invoke() == true) {
            // Los hijos no llegaron a ver este toque: no hay nada que cancelarles.
            swallowing = true
            return true
        }
        if (holding && !swallowing) {
            swallowing = true
            val cancel = MotionEvent.obtain(ev)
            cancel.action = MotionEvent.ACTION_CANCEL
            super.dispatchTouchEvent(cancel)
            cancel.recycle()
        }
        if (swallowing) {
            val action = ev.actionMasked
            if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) swallowing = false
            return true
        }
        super.dispatchTouchEvent(ev)
        // Siempre true: aunque ningún hijo quiera el toque, hay que seguir recibiendo sus movimientos.
        return true
    }

    override fun onDetachedFromWindow() {
        removeCallbacks(fire)
        holding = false
        swallowing = false
        super.onDetachedFromWindow()
    }

    private fun track(ev: MotionEvent) {
        val now = when (ev.actionMasked) {
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> false
            MotionEvent.ACTION_POINTER_UP -> bothCorners(ev, skip = ev.actionIndex)
            else -> bothCorners(ev, skip = -1)
        }
        if (now == holding) return
        holding = now
        removeCallbacks(fire)
        if (now) postDelayed(fire, CornerHold.HOLD_MS)
    }

    private fun bothCorners(ev: MotionEvent, skip: Int): Boolean {
        val xs = FloatArray(ev.pointerCount) { ev.getX(it) }
        val ys = FloatArray(ev.pointerCount) { ev.getY(it) }
        return CornerHold.bothCorners(xs, ys, skip, width.toFloat(), zone)
    }
}

/** La geometría del gesto, sin nada de Android para poder probarla sola. */
object CornerHold {
    const val HOLD_MS = 5000L
    const val ZONE_DP = 96

    /**
     * true si hay un dedo en la esquina superior izquierda y otro en la superior derecha.
     * `skip` es el índice de un dedo que se está levantando (-1 si ninguno).
     */
    fun bothCorners(xs: FloatArray, ys: FloatArray, skip: Int, width: Float, zone: Float): Boolean {
        var left = false
        var right = false
        for (i in xs.indices) {
            if (i == skip || ys[i] > zone) continue
            // Un solo dedo no cuenta por las dos esquinas, ni en una pantalla muy angosta.
            if (xs[i] <= zone && !left) left = true
            else if (xs[i] >= width - zone) right = true
        }
        return left && right
    }
}
