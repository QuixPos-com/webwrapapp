package com.webwrap

import androidx.annotation.NonNull
import com.facebook.react.uimanager.ThemedReactContext
import com.reactnativecommunity.webview.RNCWebViewManager
import com.reactnativecommunity.webview.RNCWebViewWrapper

/** Same as RNCWebViewManager, but uses [DashWebViewClient] for app-local cert trust. */
class DashWebViewManager : RNCWebViewManager() {
  override fun addEventEmitters(@NonNull reactContext: ThemedReactContext, view: RNCWebViewWrapper) {
    view.webView.webViewClient = DashWebViewClient()
  }
}
