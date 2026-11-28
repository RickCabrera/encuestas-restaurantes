package mx.sitirt.encuestas.admin

import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowInsets
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import android.window.OnBackInvokedDispatcher

/**
 * App de administradores: el panel web (/admin) a pantalla completa, con la sesión guardada,
 * subida de archivos (logo), descargas (QR, PDF, CSV) y una pantalla propia sin conexión.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var errorView: View
    private lateinit var progress: ProgressBar
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    /** Falló la carga de la página principal: se muestra la pantalla sin conexión hasta reintentar. */
    private var mainFrameFailed = false

    private val serverUrl = BuildConfig.SERVER_URL
    private val startUrl get() = "$serverUrl/admin"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val night = getColor(R.color.night)
        val root = FrameLayout(this).apply { setBackgroundColor(night) }
        val content = FrameLayout(this).apply { setBackgroundColor(getColor(R.color.paper)) }
        root.addView(content, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))

        web = WebView(this)
        content.addView(web, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            isIndeterminate = false
            progressTintList = android.content.res.ColorStateList.valueOf(getColor(R.color.basil))
            visibility = View.GONE
        }
        content.addView(progress, FrameLayout.LayoutParams(MATCH_PARENT, dp(3)).apply { gravity = Gravity.TOP })
        errorView = buildErrorView()
        content.addView(errorView, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        setContentView(root)
        applyInsets(root)

        setUpWebView()
        registerBack()

        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) web.loadUrl(startUrl)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setUpWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            setSupportZoom(false)
            builtInZoomControls = false
            // El servidor puede saber que viene de la app (p. ej. para ocultar cosas que no aplican).
            userAgentString = "$userAgentString CuentanosAdmin/${BuildConfig.VERSION_NAME} (Android)"
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(web, false)
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return false
                val url = request.url.toString()
                return when (LinkPolicy.decide(serverUrl, url)) {
                    LinkPolicy.Action.IN_APP -> false
                    LinkPolicy.Action.BROWSER, LinkPolicy.Action.EXTERNAL_APP -> {
                        openExternally(url)
                        true
                    }
                }
            }

            override fun onPageFinished(view: WebView, url: String?) {
                CookieManager.getInstance().flush()
                if (!mainFrameFailed) errorView.visibility = View.GONE
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    mainFrameFailed = true
                    errorView.visibility = View.VISIBLE
                }
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                progress.progress = newProgress
                progress.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
            }

            override fun onShowFileChooser(
                webView: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams,
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    @Suppress("DEPRECATION")
                    startActivityForResult(params.createIntent(), REQUEST_FILE)
                    true
                } catch (e: ActivityNotFoundException) {
                    fileCallback = null
                    false
                }
            }
        }

        web.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            download(url, userAgent, contentDisposition, mimeType)
        }
    }

    /** Descarga con la sesión del panel (las rutas de QR y CSV piden estar dentro). */
    private fun download(url: String, userAgent: String, contentDisposition: String?, mimeType: String?) {
        val name = URLUtil.guessFileName(url, contentDisposition, mimeType)
        try {
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                CookieManager.getInstance().getCookie(url)?.let { addRequestHeader("Cookie", it) }
                addRequestHeader("User-Agent", userAgent)
                if (!mimeType.isNullOrBlank()) setMimeType(mimeType)
                setTitle(name)
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
                } else {
                    // Antes de Android 10 la carpeta pública pide permiso de almacenamiento: se usa la de la app.
                    setDestinationInExternalFilesDir(this@MainActivity, Environment.DIRECTORY_DOWNLOADS, name)
                }
            }
            getSystemService(DownloadManager::class.java).enqueue(request)
            Toast.makeText(this, getString(R.string.downloading, name), Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(this, R.string.download_failed, Toast.LENGTH_LONG).show()
        }
    }

    private fun openExternally(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show()
        }
    }

    private fun retry() {
        mainFrameFailed = false
        errorView.visibility = View.GONE
        val current = web.url
        if (current.isNullOrBlank() || current.startsWith("about:")) web.loadUrl(startUrl) else web.reload()
    }

    private fun goBackOrFinish() {
        if (errorView.visibility != View.VISIBLE && web.canGoBack()) web.goBack() else finish()
    }

    private fun registerBack() {
        // Android 13+: el sistema ya no llama a onBackPressed (atrás predictivo).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) {
                goBackOrFinish()
            }
        }
    }

    @Deprecated("Solo para Android 12 o anterior")
    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        goBackOrFinish()
    }

    /**
     * Android 15+ dibuja siempre de borde a borde: el panel se separa de las barras del sistema y del
     * teclado con márgenes. Antes de Android 11 el sistema ya lo acomoda solo (adjustResize).
     */
    private fun applyInsets(root: View) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
        window.setDecorFitsSystemWindows(false)
        @Suppress("DEPRECATION")
        window.statusBarColor = Color.TRANSPARENT
        @Suppress("DEPRECATION")
        window.navigationBarColor = Color.TRANSPARENT
        root.setOnApplyWindowInsetsListener { v, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            val ime = insets.getInsets(WindowInsets.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            WindowInsets.CONSUMED
        }
    }

    private fun buildErrorView(): View {
        val pad = dp(28)
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(pad, pad, pad, pad)
            setBackgroundColor(getColor(R.color.paper))
            visibility = View.GONE
            isClickable = true
            addView(TextView(this@MainActivity).apply {
                text = getString(R.string.offline_title)
                setTextColor(getColor(R.color.ink))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f)
                typeface = Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER
            })
            addView(TextView(this@MainActivity).apply {
                text = getString(R.string.offline_body)
                setTextColor(getColor(R.color.ink_soft))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
                gravity = Gravity.CENTER
                setPadding(0, dp(10), 0, dp(24))
            })
            addView(Button(this@MainActivity).apply {
                text = getString(R.string.retry)
                isAllCaps = false
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
                background = GradientDrawable().apply {
                    cornerRadius = dp(24).toFloat()
                    setColor(getColor(R.color.basil))
                }
                setPadding(dp(28), 0, dp(28), 0)
                setOnClickListener { retry() }
            }, LinearLayout.LayoutParams(WRAP_CONTENT, dp(48)))
        }
    }

    @Deprecated("Selector de archivos del WebView")
    @Suppress("DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQUEST_FILE) {
            fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            fileCallback = null
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onPause() {
        CookieManager.getInstance().flush()
        web.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private companion object {
        const val REQUEST_FILE = 1001
    }
}
