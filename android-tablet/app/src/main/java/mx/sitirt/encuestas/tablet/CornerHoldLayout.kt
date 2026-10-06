package mx.sitirt.encuestas.tablet

import android.content.Context
import android.util.AttributeSet
import android.view.MotionEvent
import android.widget.FrameLayout

/**
 * Detecta el gesto de la app: un dedo en cada esquina superior durante 5 s.
 *
 * La esquina superior izquierda también es la del menú del personal de la web (3 s). En cuanto
 * hay un dedo en cada esquina, este contenedor se queda con el gesto y Android le manda un
 * "cancel" al WebView, así que el temporizador de la web se detiene y no se abren los dos menús.
 */
class CornerHoldLayout @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : FrameLayout(context, attrs) {

    var onTrigger: (() -> Unit)? = null

    private val zone = CORNER_DP * resources.displayMetrics.density
    private var holding = false
    private val fire = Runnable { onTrigger?.invoke() }

    override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
        track(ev)
        return holding
    }

    // Aquí solo llega el gesto ya interceptado, o un toque que ningún hijo quiso.
    override fun onTouchEvent(ev: MotionEvent): Boolean {
        track(ev)
        return true
    }

    override fun onDetachedFromWindow() {
        removeCallbacks(fire)
        holding = false
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
        if (now) postDelayed(fire, HOLD_MS)
    }

    private fun bothCorners(ev: MotionEvent, skip: Int): Boolean {
        var left = false
        var right = false
        for (i in 0 until ev.pointerCount) {
            if (i == skip || ev.getY(i) > zone) continue
            val x = ev.getX(i)
            if (x <= zone) left = true
            if (x >= width - zone) right = true
        }
        return left && right
    }

    private companion object {
        const val HOLD_MS = 5000L
        const val CORNER_DP = 96
    }
}
