package com.movara.app

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.inputmethod.EditorInfo
import android.webkit.CookieManager
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var serverUrlInput: EditText

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        webView = WebView(this).apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                cacheMode = WebSettings.CACHE_MODE_DEFAULT
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                userAgentString = userAgentString + " MovaraApp/1.0"
            }
            webViewClient = WebViewClient()
            CookieManager.getInstance().apply {
                setAcceptCookie(true)
                setAcceptThirdPartyCookies(this@apply, true)
            }
        }

        serverUrlInput = EditText(this).apply {
            hint = "https://your-movara-server.com"
            inputType = EditorInfo.TYPE_TEXT_VARIATION_URI
            setPadding(48, 48, 48, 48)
        }

        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        val savedUrl = prefs.getString(KEY_SERVER_URL, null)?.trim()?.removeSuffix("/")

        if (!savedUrl.isNullOrBlank()) {
            showWebView(savedUrl)
        } else {
            showServerUrlDialog(null)
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (::webView.isInitialized && webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    private fun showWebView(url: String) {
        setContentView(webView)
        webView.loadUrl(url)
    }

    private fun showServerUrlDialog(prefill: String?) {
        serverUrlInput.setText(prefill ?: "")
        AlertDialog.Builder(this)
            .setTitle("Movara server")
            .setMessage("Enter your Movara server URL (e.g. https://movara.example.com)")
            .setView(serverUrlInput)
            .setPositiveButton("Connect") { _, _ ->
                val url = serverUrlInput.text.toString().trim().removeSuffix("/")
                if (url.isBlank()) {
                    Toast.makeText(this, "Please enter a URL", Toast.LENGTH_SHORT).show()
                    showServerUrlDialog(null)
                    return@setPositiveButton
                }
                if (!url.startsWith("http://") && !url.startsWith("https://")) {
                    Toast.makeText(this, "URL must start with http:// or https://", Toast.LENGTH_SHORT).show()
                    showServerUrlDialog(url)
                    return@setPositiveButton
                }
                getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit()
                    .putString(KEY_SERVER_URL, url).apply()
                showWebView(url)
            }
            .setCancelable(false)
            .show()
    }

    companion object {
        private const val PREFS_NAME = "movara"
        private const val KEY_SERVER_URL = "server_url"
    }
}
