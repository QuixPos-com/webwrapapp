package com.webwrap

import android.webkit.SslErrorHandler
import android.webkit.WebView
import android.net.http.SslError
import com.reactnativecommunity.webview.RNCWebViewClient

class DashWebViewClient : RNCWebViewClient() {
  override fun onReceivedSslError(webView: WebView, handler: SslErrorHandler, error: SslError) {
    val context = webView.context.applicationContext
    if (DashSslTrust.shouldProceed(context, error)) {
      handler.proceed()
      return
    }
    super.onReceivedSslError(webView, handler, error)
  }
}
