package com.webwrap

import androidx.annotation.Nullable
import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager
import com.reactnativecommunity.webview.BuildConfig
import com.reactnativecommunity.webview.RNCWebViewModule
import com.reactnativecommunity.webview.RNCWebViewModuleImpl

/**
 * Replaces [com.reactnativecommunity.webview.RNCWebViewPackage] so WebViews use
 * [DashWebViewManager] / [DashWebViewClient].
 */
class DashWebViewPackage : TurboReactPackage() {
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
      listOf(DashWebViewManager())

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    return ReactModuleInfoProvider {
      val isTurboModule = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      mapOf(
          RNCWebViewModuleImpl.NAME to
              ReactModuleInfo(
                  RNCWebViewModuleImpl.NAME,
                  RNCWebViewModuleImpl.NAME,
                  false,
                  false,
                  false,
                  isTurboModule,
              ),
      )
    }
  }

  @Nullable
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return if (name == RNCWebViewModuleImpl.NAME) {
      RNCWebViewModule(reactContext)
    } else {
      null
    }
  }
}
