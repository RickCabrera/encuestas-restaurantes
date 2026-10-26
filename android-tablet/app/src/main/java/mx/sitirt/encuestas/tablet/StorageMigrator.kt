package mx.sitirt.encuestas.tablet

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONTokener

/**
 * Pasa lo que el kiosko web guarda en localStorage (token de la tablet, configuración y
 * respuestas sin enviar) de la dirección anterior del servidor a la nueva.
 *
 * El navegador guarda localStorage por dirección (esquema, IP y puerto): si la PC cambia de IP,
 * en la dirección nueva la página no encuentra el token y pediría vincular otra vez, y las
 * respuestas pendientes se quedarían en la anterior. Como es el mismo servidor (mismo
 * identificador de instalación), el token sigue siendo válido allá.
 *
 * Usa un WebView aparte con páginas vacías cargadas "como si" vinieran de cada dirección
 * (loadDataWithBaseURL): no hace falta que la dirección anterior responda.
 */
object StorageMigrator {
    private const val TIMEOUT_MS = 15_000L
    private const val BLANK = "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>"

    /** Todo lo de la página del kiosko (src/components/kiosk/storage.ts) como un objeto JSON. */
    private const val DUMP = """
        (function () {
          try {
            var out = {};
            for (var i = 0; i < localStorage.length; i++) {
              var k = localStorage.key(i);
              if (k && k.indexOf("kiosk:") === 0) out[k] = localStorage.getItem(k);
            }
            return JSON.stringify(out);
          } catch (e) {
            return null;
          }
        })()
    """

    /**
     * Escribe en la dirección nueva lo de la anterior, que es lo que la tablet usaba hasta ahora.
     * Si en la nueva había respuestas sin enviar de antes, se conservan junto con las otras.
     */
    private fun writeScript(dump: String) = """
        (function (d) {
          try {
            var keys = Object.keys(d);
            if (keys.length === 0) return "ok";
            var mine = JSON.parse(localStorage.getItem("kiosk:queue") || "[]");
            var theirs = JSON.parse(d["kiosk:queue"] || "[]");
            var seen = {};
            theirs.forEach(function (item) { seen[JSON.stringify(item.payload)] = 1; });
            mine.forEach(function (item) {
              if (!seen[JSON.stringify(item.payload)]) theirs.push(item);
            });
            var stale = [];
            for (var i = 0; i < localStorage.length; i++) {
              var k = localStorage.key(i);
              if (k && k.indexOf("kiosk:") === 0 && !(k in d)) stale.push(k);
            }
            stale.forEach(function (k) { if (k !== "kiosk:queue") localStorage.removeItem(k); });
            keys.forEach(function (k) { if (k !== "kiosk:queue") localStorage.setItem(k, d[k]); });
            localStorage.setItem("kiosk:queue", JSON.stringify(theirs));
            return "ok";
          } catch (e) {
            return "error";
          }
        })($dump)
    """

    /** En la dirección anterior: ya se pasó todo, que no quede una copia que reenviar. */
    private const val CLEAR = """
        (function () {
          try {
            var ks = [];
            for (var i = 0; i < localStorage.length; i++) {
              var k = localStorage.key(i);
              if (k && k.indexOf("kiosk:") === 0) ks.push(k);
            }
            ks.forEach(function (k) { localStorage.removeItem(k); });
            return "ok";
          } catch (e) {
            return "error";
          }
        })()
    """

    /** Llama a [done] en el hilo principal: true si se copió (o no había nada que copiar). */
    @SuppressLint("SetJavaScriptEnabled")
    fun migrate(activity: Activity, parent: ViewGroup, from: String, to: String, done: (Boolean) -> Unit) {
        val handler = Handler(Looper.getMainLooper())
        val web = WebView(activity)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.visibility = View.INVISIBLE
        parent.addView(web, 0, ViewGroup.LayoutParams(1, 1))

        var finished = false
        var step = 0
        var handled = -1
        var dump: String? = null
        lateinit var timeout: Runnable

        fun finish(ok: Boolean) {
            if (finished) return
            finished = true
            handler.removeCallbacks(timeout)
            web.stopLoading()
            parent.removeView(web)
            web.destroy()
            done(ok)
        }
        timeout = Runnable { finish(false) }
        handler.postDelayed(timeout, TIMEOUT_MS)

        fun load(base: String) = web.loadDataWithBaseURL("$base/", BLANK, "text/html", "utf-8", null)

        web.webViewClient = object : WebViewClient() {
            // Las páginas vacías no navegan a ningún lado.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = true

            override fun onPageFinished(view: WebView, url: String) {
                if (finished || handled == step) return
                handled = step
                when (step) {
                    0 -> view.evaluateJavascript(DUMP) { raw ->
                        val text = decode(raw)
                        if (text == null) return@evaluateJavascript finish(false)
                        if (text == "{}") return@evaluateJavascript finish(true)
                        dump = text
                        step = 1
                        load(to)
                    }
                    1 -> view.evaluateJavascript(writeScript(dump!!)) { raw ->
                        if (decode(raw) != "ok") return@evaluateJavascript finish(false)
                        step = 2
                        load(from)
                    }
                    // Si no se pudo borrar la copia vieja, igual ya está todo en la nueva.
                    else -> view.evaluateJavascript(CLEAR) { finish(true) }
                }
            }
        }
        load(from)
    }

    private fun decode(raw: String?): String? =
        try {
            JSONTokener(raw).nextValue() as? String
        } catch (_: Exception) {
            null
        }
}
