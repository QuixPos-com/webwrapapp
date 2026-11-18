package com.webwrap

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.util.Log
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DashCertModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private var pickPromise: Promise? = null

  private val activityListener: ActivityEventListener =
      object : BaseActivityEventListener() {
        override fun onActivityResult(
            activity: Activity,
            requestCode: Int,
            resultCode: Int,
            data: Intent?,
        ) {
          if (requestCode != REQUEST_PICK_CERT) {
            return
          }
          val promise = pickPromise ?: return
          pickPromise = null
          if (resultCode != Activity.RESULT_OK || data?.data == null) {
            promise.reject("dash_cert_cancelled", "Certificate pick cancelled")
            return
          }
          try {
            saveUri(data.data!!)
            val map = Arguments.createMap()
            map.putString("path", DashSslTrust.certFile(reactApplicationContext).absolutePath)
            map.putBoolean("installed", true)
            promise.resolve(map)
          } catch (error: Exception) {
            Log.e(TAG, "save cert failed", error)
            promise.reject("dash_cert_save_failed", error)
          }
        }
      }

  init {
    reactContext.addActivityEventListener(activityListener)
  }

  override fun getName(): String = NAME

  override fun invalidate() {
    reactApplicationContext.removeActivityEventListener(activityListener)
    super.invalidate()
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    try {
      val map = Arguments.createMap()
      map.putBoolean("installed", DashSslTrust.isInstalled(reactApplicationContext))
      promise.resolve(map)
    } catch (error: Exception) {
      promise.reject("dash_cert_status_failed", error)
    }
  }

  @ReactMethod
  fun clear(promise: Promise) {
    try {
      DashSslTrust.clear(reactApplicationContext)
      val map = Arguments.createMap()
      map.putBoolean("installed", false)
      promise.resolve(map)
    } catch (error: Exception) {
      promise.reject("dash_cert_clear_failed", error)
    }
  }

  @ReactMethod
  fun pickAndSave(promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("dash_cert_no_activity", "No activity")
      return
    }
    if (pickPromise != null) {
      promise.reject("dash_cert_in_progress", "Certificate pick already in progress")
      return
    }
    pickPromise = promise
    val intent =
        Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = "*/*"
          putExtra(
              Intent.EXTRA_MIME_TYPES,
              arrayOf(
                  "application/x-x509-ca-cert",
                  "application/x-x509-user-cert",
                  "application/pkix-cert",
                  "application/pem-certificate-chain",
                  "application/x-pem-file",
                  "text/plain",
                  "*/*",
              ),
          )
        }
    try {
      activity.startActivityForResult(intent, REQUEST_PICK_CERT)
    } catch (error: Exception) {
      pickPromise = null
      promise.reject("dash_cert_pick_failed", error)
    }
  }

  /**
   * Save a certificate from QR (or other) payload text.
   * Accepts PEM/DER text, base64 DER, or an http(s) URL to download the cert.
   */
  @ReactMethod
  fun saveFromPayload(payload: String, promise: Promise) {
    try {
      val trimmed = payload.trim()
      if (trimmed.isEmpty()) {
        promise.reject("dash_cert_empty", "Certificate payload is empty")
        return
      }
      val bytes = resolvePayloadBytes(trimmed)
      saveBytes(bytes)
      val map = Arguments.createMap()
      map.putString("path", DashSslTrust.certFile(reactApplicationContext).absolutePath)
      map.putBoolean("installed", true)
      promise.resolve(map)
    } catch (error: Exception) {
      Log.e(TAG, "saveFromPayload failed", error)
      promise.reject("dash_cert_save_failed", error)
    }
  }

  private fun resolvePayloadBytes(trimmed: String): ByteArray {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return fetchUrlBytes(trimmed)
    }
    val asText = trimmed.toByteArray(Charsets.UTF_8)
    if (DashSslTrust.parseCertificates(asText).isNotEmpty()) {
      return asText
    }
    val compact = trimmed.replace("\\s".toRegex(), "")
    try {
      val decoded = android.util.Base64.decode(compact, android.util.Base64.DEFAULT)
      if (DashSslTrust.parseCertificates(decoded).isNotEmpty()) {
        return decoded
      }
    } catch (_: Exception) {
      // fall through
    }
    throw IllegalArgumentException(
        "QR payload is not a PEM/DER certificate or a downloadable URL",
    )
  }

  private fun fetchUrlBytes(urlString: String): ByteArray {
    val connection = java.net.URL(urlString).openConnection() as java.net.HttpURLConnection
    connection.connectTimeout = 15000
    connection.readTimeout = 15000
    connection.instanceFollowRedirects = true
    connection.requestMethod = "GET"
    try {
      val code = connection.responseCode
      if (code !in 200..299) {
        throw IllegalStateException("HTTP $code fetching certificate")
      }
      return connection.inputStream.use { it.readBytes() }
    } finally {
      connection.disconnect()
    }
  }

  private fun saveUri(uri: Uri) {
    val resolver = reactApplicationContext.contentResolver
    val bytes =
        resolver.openInputStream(uri)?.use { it.readBytes() }
            ?: throw IllegalStateException("Could not read certificate file")
    saveBytes(bytes)
  }

  private fun saveBytes(bytes: ByteArray) {
    val parsed = DashSslTrust.parseCertificates(bytes)
    if (parsed.isEmpty()) {
      throw IllegalArgumentException("No X.509 certificate found")
    }
    val dest = DashSslTrust.certFile(reactApplicationContext)
    dest.writeBytes(bytes)
    Log.i(TAG, "saved ${parsed.size} cert(s) to ${dest.absolutePath}")
  }

  companion object {
    const val NAME = "DashCert"
    private const val TAG = "DashCert"
    private const val REQUEST_PICK_CERT = 0xD45C
  }
}
