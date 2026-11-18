package com.webwrap

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import java.util.concurrent.Executors

class DashAppIdentityModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private val executor = Executors.newSingleThreadExecutor()

  override fun getName(): String = NAME

  @ReactMethod
  fun getStatus(promise: Promise) {
    try {
      val status = DashAppIdentity.getStatus(reactApplicationContext)
      promise.resolve(statusToMap(status))
    } catch (error: Exception) {
      promise.reject("dash_identity_status_failed", error)
    }
  }

  @ReactMethod
  fun syncWebsite(siteUrl: String, authHeader: String?, promise: Promise) {
    executor.execute {
      try {
        val status =
            DashAppIdentity.syncFromWebsite(
                context = reactApplicationContext,
                activity = reactApplicationContext.currentActivity,
                siteUrl = siteUrl,
                authHeader = authHeader,
            )
        promise.resolve(statusToMap(status))
      } catch (error: Exception) {
        promise.reject("dash_identity_sync_failed", error)
      }
    }
  }

  @ReactMethod
  fun updateBranding(options: ReadableMap, promise: Promise) {
    val siteUrl = if (options.hasKey("siteUrl")) options.getString("siteUrl") else null
    val title = if (options.hasKey("title")) options.getString("title") else null
    val iconDataUri = if (options.hasKey("iconDataUri")) options.getString("iconDataUri") else null
    val iconUrl = if (options.hasKey("iconUrl")) options.getString("iconUrl") else null
    val authHeader = if (options.hasKey("authHeader")) options.getString("authHeader") else null

    executor.execute {
      try {
        val status =
            DashAppIdentity.updateBranding(
                context = reactApplicationContext,
                activity = reactApplicationContext.currentActivity,
                siteUrl = siteUrl,
                title = title,
                iconDataUri = iconDataUri,
                iconUrl = iconUrl,
                authHeader = authHeader,
            )
        promise.resolve(statusToMap(status))
      } catch (error: Exception) {
        promise.reject("dash_identity_update_failed", error)
      }
    }
  }

  @ReactMethod
  fun clear(promise: Promise) {
    executor.execute {
      try {
        val status =
            DashAppIdentity.clear(
                context = reactApplicationContext,
                activity = reactApplicationContext.currentActivity,
            )
        promise.resolve(statusToMap(status))
      } catch (error: Exception) {
        promise.reject("dash_identity_clear_failed", error)
      }
    }
  }

  @ReactMethod
  fun requestPinShortcut(promise: Promise) {
    try {
      val pinned = DashAppIdentity.requestPinShortcut(reactApplicationContext)
      promise.resolve(pinned)
    } catch (error: Exception) {
      promise.reject("dash_identity_pin_failed", error)
    }
  }

  private fun statusToMap(status: DashAppIdentity.Status) =
      Arguments.createMap().apply {
        putString("siteUrl", status.siteUrl)
        putString("appName", status.appName)
        if (status.iconDataUri != null) {
          putString("iconDataUri", status.iconDataUri)
        } else {
          putNull("iconDataUri")
        }
      }

  companion object {
    const val NAME = "DashAppIdentity"
  }
}
