package mx.sitirt.encuestas.tablet

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.TextView

/** Pantalla "Dirección del servidor": solo guarda una dirección que responda en /api/health. */
class SetupActivity : Activity() {
    private lateinit var input: EditText
    private lateinit var status: TextView
    private lateinit var save: Button
    private var changing = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_setup)
        input = findViewById(R.id.server_input)
        status = findViewById(R.id.status)
        save = findViewById(R.id.save)

        val current = ServerConfig.server(this)
        changing = current != null
        if (savedInstanceState == null && current != null) input.setText(current)

        findViewById<TextView>(R.id.version).text =
            getString(R.string.version_label, BuildConfig.VERSION_NAME, BuildConfig.VERSION_CODE)

        val pending = intent.getIntExtra(EXTRA_PENDING, 0)
        if (pending > 0) {
            findViewById<TextView>(R.id.pending_warning).apply {
                text = getString(R.string.setup_pending_warning, pending)
                visibility = View.VISIBLE
            }
        }
        if (changing) {
            findViewById<Button>(R.id.cancel).apply {
                visibility = View.VISIBLE
                setOnClickListener { finish() }
            }
        }

        save.setOnClickListener { submit() }
        input.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_GO) {
                submit()
                true
            } else false
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Sin servidor no hay a dónde regresar: MainActivity volvería a abrir esta pantalla.
        if (changing) finish() else moveTaskToBack(true)
    }

    private fun submit() {
        if (!save.isEnabled) return
        val text = input.text.toString()
        if (text.isBlank()) return showError(getString(R.string.setup_error_empty))
        val candidates = ServerConfig.candidates(text)
        if (candidates.isEmpty()) return showError(getString(R.string.setup_error_invalid))

        save.isEnabled = false
        input.isEnabled = false
        status.setTextColor(getColor(R.color.ink_soft))
        status.text = getString(R.string.setup_checking, candidates.first())

        Thread {
            var found: String? = null
            var answered: String? = null
            for (url in candidates) {
                when (HealthCheck.check(url)) {
                    HealthCheck.Result.OK -> found = url
                    HealthCheck.Result.NOT_SERVER -> answered = answered ?: url
                    HealthCheck.Result.UNREACHABLE -> Unit
                }
                if (found != null) break
            }
            runOnUiThread {
                if (isFinishing || isDestroyed) return@runOnUiThread
                val ok = found
                val other = answered
                when {
                    ok != null -> {
                        ServerConfig.setServer(this, ok)
                        finish()
                    }
                    other != null -> showError(getString(R.string.setup_error_not_server, other))
                    else -> showError(getString(R.string.setup_error_unreachable, text.trim()))
                }
            }
        }.start()
    }

    private fun showError(message: String) {
        save.isEnabled = true
        input.isEnabled = true
        status.setTextColor(getColor(R.color.chile))
        status.text = message
    }

    companion object {
        /** Respuestas sin enviar en el servidor actual, para avisar antes de cambiarlo. */
        const val EXTRA_PENDING = "pending"
    }
}
