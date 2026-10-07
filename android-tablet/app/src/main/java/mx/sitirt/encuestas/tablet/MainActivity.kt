package mx.sitirt.encuestas.tablet

import android.annotation.SuppressLint
import android.app.Activity
import android.app.ActivityManager
import android.app.AlertDialog
import android.app.KeyguardManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Rect
import android.graphics.Typeface
import android.net.ConnectivityManager
import android.net.Network
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.text.InputFilter
import android.text.InputType
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
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
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
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
    // Ya se pidió fijar la pantalla desde que la app volvió a primer plano.
    private var pinAsked = false
    // La página dice que la tablet está vinculada (tiene token).
    private var paired = false

    // Hasta cuándo se da por abierto el aviso de Android para fijar la pantalla; 0 si no lo está.
    // El aviso tapa la app y se queda con los toques, y Android no avisa cuando se cierra.
    private var noticeUntil = 0L
    // Pidieron el menú de la app con el aviso abierto: se abre cuando el aviso se cierre.
    private var menuQueued = false
    private val noticePoll = Runnable { checkNotice() }

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
        root.onTouch = ::onAnyTouch
        // Con el aviso de Android abierto, tampoco el menú del personal de la web debe abrirse debajo.
        root.blockChildren = ::noticeOpen
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
        requestScreenPin()
        if (server != loadedServer) loadKiosk()
        // Al volver a primer plano: que la página confirme con el servidor que sigue vinculada.
        else if (pageReady) web.evaluateJavascript(CHECK_PAIRING, null)
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
        pinAsked = false
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
        if (hasFocus) {
            enterImmersive()
            // Por si Android rechazó la petición en onResume porque la app aún no tenía el foco.
            if (ServerConfig.server(this) != null) requestScreenPin()
        }
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
    private fun capturePin() {
        if (pageReady) web.evaluateJavascript(READ_KIOSK_STATE) { raw -> applyKioskState(raw) }
    }

    /** Guarda lo que devolvió [READ_KIOSK_STATE]. true si la página aún espera al servidor. */
    private fun applyKioskState(raw: String?): Boolean =
        try {
            val state = JSONObject(JSONTokener(raw).nextValue() as String)
            pendingResponses = state.optInt("pending")
            paired = state.optBoolean("paired")
            val id = state.optString("restaurantId")
            val hash = state.optString("pinHash")
            // Sin vincular, o vinculada pero sin configuración descargada: no hay PIN que pedir.
            // La página tampoco lo pide en ese caso, y así nunca se exige el de una cadena anterior.
            if (!paired || id.isEmpty() || hash.isEmpty()) ServerConfig.setPin(this, null)
            else ServerConfig.setPin(this, ServerConfig.Pin(id, hash))
            state.optBoolean("busy")
        } catch (_: Exception) {
            // La página no devolvió nada útil: se conserva lo guardado.
            false
        }

    /**
     * Antes de abrir el menú: le pide a la página que confirme la vinculación con el servidor y
     * lee su estado. Nunca espera más de [MENU_WAIT_MS]: si la página no contesta (sin red,
     * colgada o sin cargar), el menú abre con lo que la app ya tenía guardado.
     */
    private fun refreshKioskState(then: () -> Unit) {
        if (!pageReady) return then()
        var done = false
        val deadline = SystemClock.uptimeMillis() + MENU_WAIT_MS
        fun finish() {
            if (done) return
            done = true
            then()
        }
        fun read() {
            web.evaluateJavascript(READ_KIOSK_STATE) { raw ->
                if (done) return@evaluateJavascript
                val busy = applyKioskState(raw)
                if (busy && SystemClock.uptimeMillis() + STATE_POLL_MS < deadline) handler.postDelayed({ read() }, STATE_POLL_MS)
                else finish()
            }
        }
        handler.postDelayed({ finish() }, MENU_WAIT_MS)
        web.evaluateJavascript(CHECK_PAIRING, null)
        read()
    }

    // ───────── Gesto, PIN y menú ─────────

    private fun onCornerHold() {
        if (dialog?.isShowing == true || isFinishing) return
        root.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        checkNotice()
        if (noticeOpen()) {
            // El aviso de Android está encima: el menú quedaría debajo, sin poder tocarse.
            menuQueued = true
            return
        }
        refreshKioskState {
            if (dialog?.isShowing == true || isFinishing || noticeOpen()) return@refreshKioskState
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
            val typed = input.text.toString()
            // Un PIN incompleto no gasta intento; además el Enter de un teclado físico llega dos
            // veces, la segunda con el campo ya vacío o el diálogo ya cerrado.
            if (!d.isShowing || typed.length < PIN_MIN_DIGITS) return@setOnClickListener
            val locked = PinGate.lockSeconds()
            if (locked > 0) {
                input.text.clear()
                input.error = getString(R.string.pin_locked, locked)
            } else if (PinGate.verify(pin, typed)) {
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
        val owner = isDeviceOwner()
        val pinned = isPinned()
        content.addView(TextView(this).apply {
            text = getString(R.string.menu_server, server) + "\n" +
                getString(R.string.version_label, BuildConfig.VERSION_NAME, BuildConfig.VERSION_CODE)
            textSize = 16f
            setTextColor(getColor(R.color.ink_soft))
            setPadding(0, 0, 0, dp(12))
        })
        content.addView(TextView(this).apply {
            text = getString(R.string.lock_status_title)
            textSize = 16f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(getColor(R.color.ink))
        })
        content.addView(TextView(this).apply {
            val yes = getString(R.string.lock_status_yes)
            val no = getString(R.string.lock_status_no)
            text = getString(R.string.lock_status_owner, if (owner) yes else no) + "\n" +
                getString(R.string.lock_status_pinned, if (pinned) yes else no) +
                if (owner) "" else "\n" + getString(R.string.lock_basic_warning)
            textSize = 15f
            setTextColor(getColor(R.color.ink_soft))
            setPadding(0, dp(2), 0, dp(12))
        })
        val d = AlertDialog.Builder(this)
            .setTitle(R.string.menu_title)
            .setView(ScrollView(this).apply { addView(content) })
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
        if (paired || ServerConfig.pin(this) != null) option(R.string.menu_unpair, ::unpairTablet)
        if (owner) {
            option(R.string.menu_remove_owner, ::confirmRemoveOwner)
        } else if (pinned) {
            option(R.string.menu_unlock, ::unlockScreen)
        } else {
            option(R.string.menu_lock, ::confirmLockScreen)
        }
        present(d)
    }

    private fun present(d: AlertDialog) {
        dialog = d
        d.setOnDismissListener {
            // Al pasar del PIN al menú, el aviso de cierre del PIN llega con el menú ya abierto.
            if (dialog !== d) return@setOnDismissListener
            dialog = null
            handler.removeCallbacks(closeDialog)
            enterImmersive()
            // Si faltaba pedir el bloqueo y no se pidió por tener un diálogo abierto, ahora sí.
            if (ServerConfig.server(this) != null) requestScreenPin()
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

    private fun isPinned(): Boolean =
        getSystemService(ActivityManager::class.java).lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE

    /**
     * Fijar pantalla, para tablets que no son "device owner": si el personal la dejó bloqueada se
     * vuelve a pedir al abrir la app (tras un reinicio, o si alguien la desfijó). Android siempre
     * muestra su aviso de confirmación, que tapa la app: se pide una sola vez por regreso a primer
     * plano y nunca con un diálogo de la app abierto. Si responden "No, gracias" la preferencia se
     * borra (ver [onAnyTouch]) y ya solo se vuelve a pedir desde "Bloquear tablet".
     */
    private fun requestScreenPin() {
        if (pinAsked || isDeviceOwner() || !ScreenLock.wanted(this) || isPinned()) return
        if (dialog?.isShowing == true || noticeOpen()) return
        // Con la pantalla de bloqueo todavía encima Android acepta la petición pero no muestra su
        // aviso. Se espera: al quitarse, la app recibe el foco y se vuelve a pasar por aquí.
        if (getSystemService(KeyguardManager::class.java).isKeyguardLocked) return
        try {
            startLockTask()
            pinAsked = true
            noticeOpened()
        } catch (_: Exception) {
            // La app todavía no está al frente: se reintenta al recibir el foco.
        }
    }

    /** "Bloquear tablet" avisa primero de que es un bloqueo básico, sin impedirlo. */
    private fun confirmLockScreen() {
        val d = AlertDialog.Builder(this)
            .setTitle(R.string.menu_lock)
            .setMessage(R.string.lock_basic_warning)
            .setPositiveButton(R.string.lock_continue) { _, _ -> lockScreen() }
            .setNegativeButton(R.string.setup_cancel, null)
            .create()
        present(d)
    }

    private fun lockScreen() {
        ScreenLock.setWanted(this, true)
        pinAsked = true
        try {
            startLockTask()
            noticeOpened()
        } catch (_: Exception) {
            ScreenLock.setWanted(this, false)
            Toast.makeText(this, R.string.lock_unsupported, Toast.LENGTH_LONG).show()
        }
    }

    // ───────── Aviso de Android al fijar ─────────

    private fun noticeOpen() = noticeUntil != 0L

    private fun noticeOpened() {
        if (isPinned()) return
        noticeUntil = SystemClock.uptimeMillis() + NOTICE_MAX_MS
        handler.removeCallbacks(noticePoll)
        handler.postDelayed(noticePoll, NOTICE_POLL_MS)
    }

    /** Android no avisa cuando se responde su aviso: se pregunta cada poco si ya quedó fijada. */
    private fun checkNotice() {
        if (!noticeOpen()) return
        when {
            isPinned() -> {
                ScreenLock.setWanted(this, true)
                noticeClosed(openQueuedMenu = true)
            }
            // Nadie respondió, o esta tablet no muestra aviso: se deja de esperar para no bloquear el menú.
            SystemClock.uptimeMillis() >= noticeUntil -> noticeClosed(openQueuedMenu = false)
            else -> {
                handler.removeCallbacks(noticePoll)
                handler.postDelayed(noticePoll, NOTICE_POLL_MS)
            }
        }
    }

    private fun noticeClosed(openQueuedMenu: Boolean) {
        noticeUntil = 0L
        handler.removeCallbacks(noticePoll)
        val queued = menuQueued
        menuQueued = false
        if (queued && openQueuedMenu) onCornerHold()
    }

    /**
     * El aviso de Android cubre la app salvo la franja de la barra de estado. Si llega un toque
     * por debajo de esa franja y la pantalla no quedó fijada, el aviso ya no está: respondieron
     * "No, gracias". Se borra la preferencia para no volver a mostrarlo en cada regreso.
     */
    private fun onAnyTouch(ev: MotionEvent) {
        if (!noticeOpen() || ev.actionMasked != MotionEvent.ACTION_DOWN || ev.y <= noticeStripHeight()) return
        if (isPinned()) return checkNotice()
        ScreenLock.setWanted(this, false)
        noticeClosed(openQueuedMenu = true)
    }

    @SuppressLint("DiscouragedApi", "InternalInsetResource")
    private fun noticeStripHeight(): Int {
        val bar = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            root.rootWindowInsets
                ?.getInsetsIgnoringVisibility(WindowInsets.Type.statusBars() or WindowInsets.Type.displayCutout())
                ?.top
        } else {
            resources.getIdentifier("status_bar_height", "dimen", "android")
                .takeIf { it != 0 }
                ?.let(resources::getDimensionPixelSize)
        }
        return (bar ?: dp(48)) + dp(8)
    }

    private fun unlockScreen() {
        ScreenLock.setWanted(this, false)
        if (!isPinned()) return
        try {
            stopLockTask()
        } catch (_: Exception) {
            // La pantalla se fijó desde Recientes y Android no deja que la app la suelte.
            Toast.makeText(this, R.string.unlock_manual, Toast.LENGTH_LONG).show()
        }
    }

    // ───────── Desvincular ─────────

    /**
     * "Desvincular esta tablet": lo hace la página (intenta enviar lo pendiente, confirma y avisa
     * al servidor). Si la página no está cargada o es de un servidor sin esa función, la app
     * borra por su cuenta lo que la página guardó.
     */
    private fun unpairTablet() {
        if (!pageReady) return confirmLocalUnpair()
        web.evaluateJavascript(REQUEST_UNPAIR) { raw -> if (raw != "true") confirmLocalUnpair() }
    }

    private fun confirmLocalUnpair() {
        val message = getString(R.string.unpair_message) +
            if (pendingResponses > 0) {
                "\n\n" + resources.getQuantityString(R.plurals.unpair_pending, pendingResponses, pendingResponses)
            } else ""
        val d = AlertDialog.Builder(this)
            .setTitle(R.string.menu_unpair)
            .setMessage(message)
            .setPositiveButton(R.string.unpair_confirm) { _, _ ->
                // Token, configuración y cola viven en el localStorage de la página.
                WebStorage.getInstance().deleteAllData()
                ServerConfig.setPin(this, null)
                paired = false
                pendingResponses = 0
                handler.removeCallbacks(retry)
                loadKiosk()
            }
            .setNegativeButton(R.string.setup_cancel, null)
            .create()
        present(d)
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
        // Que al dejar de ser device owner no se pida fijar la pantalla por una preferencia vieja.
        ScreenLock.setWanted(this, false)
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
        // El panel pide un PIN de 4 a 6 dígitos.
        const val PIN_MIN_DIGITS = 4
        // Lo más que el menú de la app espera a la página antes de abrir.
        const val MENU_WAIT_MS = 1000L
        const val STATE_POLL_MS = 150L
        // Lo más que se da por abierto el aviso de Android para fijar la pantalla.
        const val NOTICE_MAX_MS = 30_000L
        const val NOTICE_POLL_MS = 300L

        /** Funciones que la página del kiosko le deja a la app (src/components/kiosk/kiosk-app.tsx). */
        const val CHECK_PAIRING = "window.sobremesaKiosk && window.sobremesaKiosk.check()"
        const val REQUEST_UNPAIR = """
            (function () {
              var kiosk = window.sobremesaKiosk;
              if (!kiosk || !localStorage.getItem("kiosk:token")) return false;
              kiosk.requestUnpair();
              return true;
            })()
        """

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
                  pending: queue.length,
                  busy: !!(window.sobremesaKiosk && window.sobremesaKiosk.busy)
                });
              } catch (e) {
                return null;
              }
            })()
        """
    }
}
