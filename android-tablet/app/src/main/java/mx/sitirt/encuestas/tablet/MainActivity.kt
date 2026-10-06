package mx.sitirt.encuestas.tablet

import android.annotation.SuppressLint
import android.app.Activity
import android.app.ActivityManager
import android.app.AlertDialog
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Rect
import android.net.ConnectivityManager
import android.net.Network
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputFilter
import android.text.InputType
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import org.json.JSONTokener

/** El kiosko: `<servidor>/kiosk` en un WebView a pantalla completa. */
class MainActivity : Activity() {
    private lateinit var root: CornerHoldLayout
    private lateinit var web: WebView
    private lateinit var offline: View
    private lateinit var offlineDetail: TextView

    private val handler = Handler(Looper.getMainLooper())
    private val retry = Runnable { loadKiosk() }

    private var loadedServer: String? = null
    private var loadFailed = false
    // La página del kiosko está cargada y se puede leer su localStorage.
    private var pageReady = false
    private var pendingResponses = 0
    private var dialog: AlertDialog? = null
    private val closeDialog = Runnable { dialog?.dismiss() }

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            handler.post {
                if (!loadFailed) return@post
                handler.removeCallbacks(retry)
                loadKiosk()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_main)
        root = findViewById(R.id.root)
        web = findViewById(R.id.web)
        offline = findViewById(R.id.offline)
        offlineDetail = findViewById(R.id.offline_detail)

        root.onTrigger = ::onCornerHold
        keepContentAboveKeyboard()
        setUpWebView()
    }

    override fun onStart() {
        super.onStart()
        getSystemService(ConnectivityManager::class.java).registerDefaultNetworkCallback(networkCallback)
    }

    override fun onResume() {
        super.onResume()
        enterImmersive()
        web.onResume()
        val server = ServerConfig.server(this)
        if (server == null) {
            startActivity(Intent(this, SetupActivity::class.java))
            return
        }
        applyLockTask()
        if (server != loadedServer) loadKiosk()
    }

    override fun onPause() {
        capturePin()
        web.onPause()
        // Sin esto las cookies recientes pueden perderse si Android mata la app.
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onStop() {
        getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(networkCallback)
        super.onStop()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        dialog?.dismiss()
        web.destroy()
        super.onDestroy()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterImmersive()
    }

    // Modo kiosko: el botón atrás no hace nada.
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() = Unit

    // ───────── WebView ─────────

    @SuppressLint("SetJavaScriptEnabled")
    private fun setUpWebView() {
        CookieManager.getInstance().setAcceptCookie(true)
        web.settings.apply {
            javaScriptEnabled = true
            // localStorage guarda el token de la tablet y la cola de respuestas sin enviar.
            domStorageEnabled = true
            setSupportZoom(false)
            textZoom = 100
            userAgentString = "$userAgentString SobremesaTablet/${BuildConfig.VERSION_NAME}"
        }
        web.overScrollMode = View.OVER_SCROLL_NEVER
        // Sin un WebChromeClient el confirm() de "Desvincular esta tablet" no se muestra.
        web.webChromeClient = WebChromeClient()
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                !isServerUrl(request.url)

            override fun onPageFinished(view: WebView, url: String) {
                if (loadFailed) return
                pageReady = true
                offline.visibility = View.GONE
                web.visibility = View.VISIBLE
                capturePin()
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) showOffline()
            }

            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
                if (request.isForMainFrame && response.statusCode >= 500) showOffline()
            }

            override fun onReceivedSslError(view: WebView, sslHandler: SslErrorHandler, error: SslError) {
                sslHandler.cancel()
                if (!pageReady) showOffline()
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                // El WebView ya no sirve: se reconstruye la pantalla en lugar de dejar caer la app.
                recreate()
                return true
            }
        }
    }

    private fun isServerUrl(url: Uri): Boolean {
        val server = Uri.parse(ServerConfig.server(this) ?: return false)
        return url.scheme == server.scheme && url.host == server.host && url.port == server.port
    }

    private fun loadKiosk() {
        val server = ServerConfig.server(this) ?: return
        if (loadedServer != null && loadedServer != server) pendingResponses = 0
        loadedServer = server
        loadFailed = false
        pageReady = false
        offlineDetail.text = getString(R.string.offline_detail, server)
        web.loadUrl(ServerConfig.kioskUrl(server))
    }

    /**
     * Solo cuando /kiosk no logra abrir. Si la página ya está cargada y se va el internet no se
     * tapa: el kiosko sigue recibiendo encuestas y las envía al volver la conexión.
     */
    private fun showOffline() {
        loadFailed = true
        pageReady = false
        web.visibility = View.INVISIBLE
        offline.visibility = View.VISIBLE
        handler.removeCallbacks(retry)
        handler.postDelayed(retry, RETRY_MS)
    }

    /**
     * Copia a la app el PIN del restaurante vinculado (su hash) para poder pedirlo aunque el
     * servidor ya no responda, y cuenta las respuestas que la tablet aún no envía.
     */
    private fun capturePin(then: (() -> Unit)? = null) {
        if (!pageReady) {
            then?.invoke()
            return
        }
        web.evaluateJavascript(READ_KIOSK_STATE) { raw ->
            try {
                val state = JSONObject(JSONTokener(raw).nextValue() as String)
                pendingResponses = state.optInt("pending")
                val id = state.optString("restaurantId")
                val hash = state.optString("pinHash")
                if (!state.optBoolean("paired")) ServerConfig.setPin(this, null)
                else if (id.isNotEmpty() && hash.isNotEmpty()) ServerConfig.setPin(this, ServerConfig.Pin(id, hash))
            } catch (_: Exception) {
                // La página no devolvió nada útil: se conserva lo guardado.
            }
            then?.invoke()
        }
    }

    // ───────── Gesto, PIN y menú ─────────

    private fun onCornerHold() {
        if (dialog?.isShowing == true || isFinishing) return
        root.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        capturePin {
            // Una tablet sin vincular todavía no tiene PIN.
            val pin = ServerConfig.pin(this)
            if (pin == null) showMenu() else showPinDialog(pin)
        }
    }

    private fun showPinDialog(pin: ServerConfig.Pin) {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            filters = arrayOf(InputFilter.LengthFilter(6))
            imeOptions = EditorInfo.IME_ACTION_DONE
            gravity = Gravity.CENTER
            textSize = 28f
        }
        val box = LinearLayout(this).apply {
            setPadding(dp(24), dp(8), dp(24), 0)
            addView(input, LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }
        val d = AlertDialog.Builder(this)
            .setTitle(R.string.pin_title)
            .setMessage(R.string.pin_message)
            .setView(box)
            .setPositiveButton(R.string.pin_ok, null)
            .setNegativeButton(R.string.menu_close, null)
            .create()
        d.window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE)
        present(d)
        input.requestFocus()
        // Se reemplaza el clic para que un PIN incorrecto no cierre el diálogo.
        val enter = d.getButton(AlertDialog.BUTTON_POSITIVE)
        input.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) enter.performClick()
            true
        }
        enter.setOnClickListener {
            val locked = PinGate.lockSeconds()
            if (locked > 0) {
                input.error = getString(R.string.pin_locked, locked)
            } else if (PinGate.verify(pin, input.text.toString())) {
                d.dismiss()
                showMenu()
            } else {
                val nowLocked = PinGate.lockSeconds()
                input.text.clear()
                input.error =
                    if (nowLocked > 0) getString(R.string.pin_locked, nowLocked) else getString(R.string.pin_wrong)
            }
        }
    }

    private fun showMenu() {
        val server = ServerConfig.server(this) ?: return
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(8), dp(24), 0)
        }
        content.addView(TextView(this).apply {
            text = getString(R.string.menu_server, server) + "\n" +
                getString(R.string.version_label, BuildConfig.VERSION_NAME, BuildConfig.VERSION_CODE)
            textSize = 16f
            setTextColor(getColor(R.color.ink_soft))
            setPadding(0, 0, 0, dp(12))
        })
        val d = AlertDialog.Builder(this)
            .setTitle(R.string.menu_title)
            .setView(content)
            .setNegativeButton(R.string.menu_close, null)
            .create()

        fun option(label: Int, action: () -> Unit) {
            content.addView(Button(this).apply {
                setText(label)
                isAllCaps = false
                textSize = 18f
                setOnClickListener {
                    d.dismiss()
                    action()
                }
            }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(60)))
        }
        option(R.string.menu_reload) {
            handler.removeCallbacks(retry)
            loadKiosk()
        }
        option(R.string.menu_change_server) {
            startActivity(
                Intent(this, SetupActivity::class.java).putExtra(SetupActivity.EXTRA_PENDING, pendingResponses),
            )
        }
        if (isDeviceOwner()) option(R.string.menu_remove_owner, ::confirmRemoveOwner)
        present(d)
    }

    private fun present(d: AlertDialog) {
        dialog = d
        d.setOnDismissListener {
            handler.removeCallbacks(closeDialog)
            if (dialog === d) dialog = null
            enterImmersive()
        }
        d.show()
        // Que el menú no se quede abierto frente al siguiente comensal.
        handler.removeCallbacks(closeDialog)
        handler.postDelayed(closeDialog, DIALOG_TIMEOUT_MS)
    }

    // ───────── Modo kiosko ─────────

    @Suppress("DEPRECATION")
    private fun enterImmersive() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.apply {
                hide(WindowInsets.Type.systemBars())
                systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    or View.SYSTEM_UI_FLAG_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                )
        }
    }

    /** A pantalla completa Android no encoge la ventana al abrir el teclado: se hace a mano. */
    private fun keepContentAboveKeyboard() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            root.setOnApplyWindowInsetsListener { v, insets ->
                v.setPadding(0, 0, 0, insets.getInsets(WindowInsets.Type.ime()).bottom)
                insets
            }
        } else {
            val visible = Rect()
            root.viewTreeObserver.addOnGlobalLayoutListener {
                root.getWindowVisibleDisplayFrame(visible)
                val total = root.rootView.height
                val covered = total - visible.bottom
                val padding = if (covered > total * 0.15) covered else 0
                if (root.paddingBottom != padding) root.setPadding(0, 0, 0, padding)
            }
        }
    }

    private fun isDeviceOwner(): Boolean =
        getSystemService(DevicePolicyManager::class.java).isDeviceOwnerApp(packageName)

    /**
     * Bloqueo total, solo si la tablet se registró como "device owner": la app queda fija en
     * pantalla (sin Inicio, Recientes ni notificaciones) y como pantalla de inicio.
     */
    private fun applyLockTask() {
        if (!isDeviceOwner()) return
        try {
            val dpm = getSystemService(DevicePolicyManager::class.java)
            val admin = ComponentName(this, AdminReceiver::class.java)
            dpm.setLockTaskPackages(admin, arrayOf(packageName))
            val home = IntentFilter(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                addCategory(Intent.CATEGORY_DEFAULT)
            }
            dpm.addPersistentPreferredActivity(admin, home, ComponentName(this, MainActivity::class.java))
            val am = getSystemService(ActivityManager::class.java)
            if (am.lockTaskModeState == ActivityManager.LOCK_TASK_MODE_NONE) startLockTask()
        } catch (_: Exception) {
            // Sin bloqueo total la app sigue funcionando en modo inmersivo.
        }
    }

    private fun confirmRemoveOwner() {
        val d = AlertDialog.Builder(this)
            .setTitle(R.string.remove_owner_title)
            .setMessage(R.string.remove_owner_message)
            .setPositiveButton(R.string.remove_owner_confirm) { _, _ -> removeOwner() }
            .setNegativeButton(R.string.setup_cancel, null)
            .create()
        present(d)
    }

    @Suppress("DEPRECATION")
    private fun removeOwner() {
        try {
            stopLockTask()
            val dpm = getSystemService(DevicePolicyManager::class.java)
            dpm.clearPackagePersistentPreferredActivities(ComponentName(this, AdminReceiver::class.java), packageName)
            dpm.clearDeviceOwnerApp(packageName)
        } catch (_: Exception) {
            // Ya no era device owner.
        }
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private companion object {
        const val RETRY_MS = 10_000L
        const val DIALOG_TIMEOUT_MS = 60_000L

        /** Lee lo que el kiosko web guarda en localStorage (src/components/kiosk/storage.ts). */
        const val READ_KIOSK_STATE = """
            (function () {
              try {
                var config = JSON.parse(localStorage.getItem("kiosk:config") || "null");
                var queue = JSON.parse(localStorage.getItem("kiosk:queue") || "[]");
                return JSON.stringify({
                  paired: !!localStorage.getItem("kiosk:token"),
                  restaurantId: config ? config.restaurant.id : "",
                  pinHash: config ? config.restaurant.pinHash : "",
                  pending: queue.length
                });
              } catch (e) {
                return null;
              }
            })()
        """
    }
}
