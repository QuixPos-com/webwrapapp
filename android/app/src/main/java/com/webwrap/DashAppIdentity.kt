package com.webwrap

import android.app.Activity
import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.drawable.Icon
import android.os.Build
import android.text.Html
import android.util.Base64
import android.util.Log
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.security.KeyStore
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/**
 * Manages dynamic App Name (page title) and App Icon (website favicon) for the active website,
 * applying them to Android's task description (Recents / app switcher / window header),
 * Activity title, and Launcher shortcuts.
 */
object DashAppIdentity {
  private const val TAG = "DashAppIdentity"
  private const val PREFS_NAME = "dash_app_identity"
  private const val KEY_SITE_URL = "site_url"
  private const val KEY_APP_NAME = "app_name"
  private const val KEY_ICON_DATA_URI = "icon_data_uri"
  private const val ICON_FILE_NAME = "dash-site-icon.png"
  private const val SHORTCUT_ID = "active_website"
  private const val TARGET_ICON_SIZE = 192

  data class Status(
      val siteUrl: String,
      val appName: String,
      val iconDataUri: String?,
  )

  private fun prefs(context: Context) =
      context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  private fun iconFile(context: Context): File =
      File(context.applicationContext.filesDir, ICON_FILE_NAME)

  fun defaultAppName(context: Context): String =
      context.applicationContext.getString(R.string.app_name)

  fun getStatus(context: Context): Status {
    val p = prefs(context)
    val siteUrl = p.getString(KEY_SITE_URL, "") ?: ""
    val appName = (p.getString(KEY_APP_NAME, "") ?: "").ifBlank { defaultAppName(context) }
    val iconDataUri = p.getString(KEY_ICON_DATA_URI, null)?.takeIf { it.isNotBlank() }
    return Status(siteUrl = siteUrl, appName = appName, iconDataUri = iconDataUri)
  }

  fun clear(context: Context, activity: Activity? = null): Status {
    val appCtx = context.applicationContext
    prefs(appCtx).edit().clear().apply()
    iconFile(appCtx).delete()
    removeDynamicShortcuts(appCtx)
    if (activity != null) {
      applyToActivity(activity)
    }
    return getStatus(appCtx)
  }

  fun applyToActivity(activity: Activity) {
    val appCtx = activity.applicationContext
    val p = prefs(appCtx)
    val customName = (p.getString(KEY_APP_NAME, "") ?: "").trim()
    val effectiveName = customName.ifBlank { defaultAppName(appCtx) }
    val customBitmap = loadStoredIconBitmap(appCtx)
    val effectiveBitmap =
        customBitmap ?: BitmapFactory.decodeResource(activity.resources, R.mipmap.ic_launcher)

    activity.runOnUiThread {
      try {
        activity.title = effectiveName
        @Suppress("DEPRECATION")
        val taskDesc =
            if (effectiveBitmap != null) {
              ActivityManager.TaskDescription(effectiveName, effectiveBitmap)
            } else {
              ActivityManager.TaskDescription(effectiveName)
            }
        activity.setTaskDescription(taskDesc)
      } catch (error: Exception) {
        Log.w(TAG, "applyToActivity failed", error)
      }
    }

    if (customName.isNotEmpty() || customBitmap != null) {
      updateLauncherShortcuts(appCtx, effectiveName, effectiveBitmap)
    }
  }

  @Synchronized
  fun updateBranding(
      context: Context,
      activity: Activity?,
      siteUrl: String?,
      title: String?,
      iconDataUri: String?,
      iconUrl: String?,
      authHeader: String?,
  ): Status {
    val appCtx = context.applicationContext
    val p = prefs(appCtx)
    val incomingSiteUrl = siteUrl?.trim() ?: ""
    val previousSiteUrl = p.getString(KEY_SITE_URL, "") ?: ""

    if (incomingSiteUrl.isNotEmpty() &&
        previousSiteUrl.isNotEmpty() &&
        !sameOrigin(incomingSiteUrl, previousSiteUrl)) {
      p.edit().remove(KEY_APP_NAME).remove(KEY_ICON_DATA_URI).apply()
      iconFile(appCtx).delete()
    }

    val editor = p.edit()
    if (incomingSiteUrl.isNotEmpty()) {
      editor.putString(KEY_SITE_URL, incomingSiteUrl)
    }

    val cleanedTitle = title?.trim() ?: ""
    if (cleanedTitle.isNotEmpty()) {
      editor.putString(KEY_APP_NAME, cleanedTitle)
    }
    editor.apply()

    val decodedBitmap =
        decodeDataUriBitmap(iconDataUri)
            ?: iconUrl?.trim()?.takeIf { it.isNotEmpty() }?.let { url ->
              val effectiveAuth =
                  if (incomingSiteUrl.isNotEmpty() && sameOrigin(incomingSiteUrl, url)) {
                    authHeader
                  } else {
                    null
                  }
              fetchAndDecodeIconBitmap(appCtx, url, effectiveAuth)
            }

    if (decodedBitmap != null) {
      saveIconBitmap(appCtx, decodedBitmap)
    }

    if (activity != null) {
      applyToActivity(activity)
    }
    return getStatus(appCtx)
  }

  @Synchronized
  fun syncFromWebsite(
      context: Context,
      activity: Activity?,
      siteUrl: String,
      authHeader: String?,
  ): Status {
    val appCtx = context.applicationContext
    val trimmedUrl = siteUrl.trim()
    if (trimmedUrl.isEmpty()) {
      return clear(appCtx, activity)
    }

    val p = prefs(appCtx)
    val previousSiteUrl = p.getString(KEY_SITE_URL, "") ?: ""
    val originChanged =
        previousSiteUrl.isEmpty() || !sameOrigin(trimmedUrl, previousSiteUrl)

    if (originChanged) {
      p.edit()
          .putString(KEY_SITE_URL, trimmedUrl)
          .remove(KEY_APP_NAME)
          .remove(KEY_ICON_DATA_URI)
          .apply()
      iconFile(appCtx).delete()
      if (activity != null) {
        applyToActivity(activity)
      }
    } else {
      p.edit().putString(KEY_SITE_URL, trimmedUrl).apply()
    }

    var discoveredTitle: String? = null
    val iconCandidates = LinkedHashSet<String>()

    try {
      val htmlBytes = fetchBytes(appCtx, trimmedUrl, authHeader, maxBytes = 256 * 1024)
      if (htmlBytes != null && htmlBytes.isNotEmpty()) {
        val html = htmlBytes.toString(Charsets.UTF_8)
        discoveredTitle = extractHtmlTitle(html)
        for (href in extractIconHrefs(html)) {
          resolveUrl(trimmedUrl, href)?.let { iconCandidates.add(it) }
        }
      }
    } catch (error: Exception) {
      Log.d(TAG, "HTML probe for $trimmedUrl failed: ${error.message}")
    }

    resolveUrl(trimmedUrl, "/favicon.ico")?.let { iconCandidates.add(it) }

    val currentName = (p.getString(KEY_APP_NAME, "") ?: "").trim()
    if (currentName.isEmpty() && !discoveredTitle.isNullOrBlank()) {
      p.edit().putString(KEY_APP_NAME, discoveredTitle.trim()).apply()
    }

    if (!iconFile(appCtx).isFile) {
      for (candidateUrl in iconCandidates) {
        val effectiveAuth = if (sameOrigin(trimmedUrl, candidateUrl)) authHeader else null
        val bmp = fetchAndDecodeIconBitmap(appCtx, candidateUrl, effectiveAuth)
        if (bmp != null) {
          saveIconBitmap(appCtx, bmp)
          break
        }
      }
    }

    if (activity != null) {
      applyToActivity(activity)
    }
    return getStatus(appCtx)
  }

  fun requestPinShortcut(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return false
    }
    val appCtx = context.applicationContext
    val shortcutManager = appCtx.getSystemService(ShortcutManager::class.java) ?: return false
    if (!shortcutManager.isRequestPinShortcutSupported) {
      return false
    }
    val status = getStatus(appCtx)
    val bitmap =
        loadStoredIconBitmap(appCtx)
            ?: BitmapFactory.decodeResource(appCtx.resources, R.mipmap.ic_launcher)
    val shortcut = buildShortcutInfo(appCtx, status.appName, bitmap)
    return shortcutManager.requestPinShortcut(shortcut, null)
  }

  private fun updateLauncherShortcuts(context: Context, appName: String, bitmap: Bitmap?) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) {
      return
    }
    try {
      val shortcutManager = context.getSystemService(ShortcutManager::class.java) ?: return
      val shortcut = buildShortcutInfo(context, appName, bitmap)
      shortcutManager.setDynamicShortcuts(listOf(shortcut))
      shortcutManager.updateShortcuts(listOf(shortcut))
    } catch (error: Exception) {
      Log.w(TAG, "updateLauncherShortcuts failed", error)
    }
  }

  private fun removeDynamicShortcuts(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) {
      return
    }
    try {
      val shortcutManager = context.getSystemService(ShortcutManager::class.java) ?: return
      shortcutManager.removeAllDynamicShortcuts()
    } catch (error: Exception) {
      Log.w(TAG, "removeDynamicShortcuts failed", error)
    }
  }

  private fun buildShortcutInfo(
      context: Context,
      appName: String,
      bitmap: Bitmap?,
  ): ShortcutInfo {
    val label = appName.trim().ifBlank { defaultAppName(context) }
    val shortLabel = if (label.length > 25) label.substring(0, 25) else label
    val longLabel = if (label.length > 50) label.substring(0, 50) else label
    val launchIntent =
        Intent(context, MainActivity::class.java).apply {
          action = Intent.ACTION_MAIN
          addCategory(Intent.CATEGORY_LAUNCHER)
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED
        }
    val builder =
        ShortcutInfo.Builder(context, SHORTCUT_ID)
            .setShortLabel(shortLabel)
            .setLongLabel(longLabel)
            .setIntent(launchIntent)
    if (bitmap != null) {
      builder.setIcon(Icon.createWithBitmap(bitmap))
    } else {
      builder.setIcon(Icon.createWithResource(context, R.mipmap.ic_launcher))
    }
    return builder.build()
  }

  private fun loadStoredIconBitmap(context: Context): Bitmap? {
    val file = iconFile(context)
    if (!file.isFile || file.length() == 0L) {
      return null
    }
    return try {
      BitmapFactory.decodeFile(file.absolutePath)
    } catch (error: Exception) {
      Log.w(TAG, "decode stored icon failed", error)
      null
    }
  }

  private fun saveIconBitmap(context: Context, rawBitmap: Bitmap) {
    try {
      val normalized = normalizeIconBitmap(rawBitmap)
      val out = ByteArrayOutputStream()
      normalized.compress(Bitmap.CompressFormat.PNG, 100, out)
      val pngBytes = out.toByteArray()
      iconFile(context).writeBytes(pngBytes)
      val dataUri = "data:image/png;base64," + Base64.encodeToString(pngBytes, Base64.NO_WRAP)
      prefs(context).edit().putString(KEY_ICON_DATA_URI, dataUri).apply()
    } catch (error: Exception) {
      Log.w(TAG, "saveIconBitmap failed", error)
    }
  }

  private fun normalizeIconBitmap(source: Bitmap): Bitmap {
    val srcW = source.width.coerceAtLeast(1)
    val srcH = source.height.coerceAtLeast(1)
    if (srcW == TARGET_ICON_SIZE && srcH == TARGET_ICON_SIZE && source.config == Bitmap.Config.ARGB_8888) {
      return source
    }
    val output = Bitmap.createBitmap(TARGET_ICON_SIZE, TARGET_ICON_SIZE, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(output)
    val scale = minOf(TARGET_ICON_SIZE.toFloat() / srcW, TARGET_ICON_SIZE.toFloat() / srcH)
    val dstW = srcW * scale
    val dstH = srcH * scale
    val left = (TARGET_ICON_SIZE - dstW) / 2f
    val top = (TARGET_ICON_SIZE - dstH) / 2f
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    canvas.drawBitmap(source, null, RectF(left, top, left + dstW, top + dstH), paint)
    return output
  }

  private fun decodeDataUriBitmap(dataUri: String?): Bitmap? {
    if (dataUri.isNullOrBlank()) {
      return null
    }
    val match = Regex("^data:image/[^;]+;base64,(.+)$", RegexOption.DOT_MATCHES_ALL).find(dataUri.trim())
        ?: return null
    return try {
      val bytes = Base64.decode(match.groupValues[1].replace("\\s".toRegex(), ""), Base64.DEFAULT)
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    } catch (error: Exception) {
      Log.w(TAG, "decodeDataUriBitmap failed", error)
      null
    }
  }

  private fun fetchAndDecodeIconBitmap(
      context: Context,
      iconUrl: String,
      authHeader: String?,
  ): Bitmap? {
    return try {
      val bytes = fetchBytes(context, iconUrl, authHeader, maxBytes = 2 * 1024 * 1024) ?: return null
      if (bytes.isEmpty()) {
        return null
      }
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    } catch (error: Exception) {
      Log.d(TAG, "fetchAndDecodeIconBitmap failed for $iconUrl: ${error.message}")
      null
    }
  }

  private fun fetchBytes(
      context: Context,
      urlString: String,
      authHeader: String?,
      maxBytes: Int,
  ): ByteArray? {
    var currentUrl = urlString
    var redirects = 0
    while (redirects < 5) {
      val url = URL(currentUrl)
      val connection = (url.openConnection() as HttpURLConnection).apply {
        connectTimeout = 8000
        readTimeout = 8000
        instanceFollowRedirects = false
        requestMethod = "GET"
        setRequestProperty(
            "User-Agent",
            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
        )
        if (!authHeader.isNullOrBlank() && sameOrigin(urlString, currentUrl)) {
          setRequestProperty("Authorization", authHeader)
        }
      }
      if (connection is HttpsURLConnection) {
        configureLocalTrustIfPresent(context, connection)
      }
      try {
        val code = connection.responseCode
        if (code in 300..399) {
          val location = connection.getHeaderField("Location") ?: return null
          currentUrl = resolveUrl(currentUrl, location) ?: return null
          redirects++
          continue
        }
        if (code !in 200..299) {
          return null
        }
        return connection.inputStream.use { input ->
          val buffer = ByteArrayOutputStream()
          val chunk = ByteArray(8192)
          var total = 0
          while (true) {
            val read = input.read(chunk)
            if (read <= 0) break
            val allowed = minOf(read, maxBytes - total)
            if (allowed > 0) {
              buffer.write(chunk, 0, allowed)
              total += allowed
            }
            if (total >= maxBytes) break
          }
          buffer.toByteArray()
        }
      } finally {
        connection.disconnect()
      }
    }
    return null
  }

  private fun configureLocalTrustIfPresent(context: Context, connection: HttpsURLConnection) {
    val customCerts = DashSslTrust.loadTrustedCerts(context)
    if (customCerts.isEmpty()) {
      return
    }
    try {
      val defaultTmf =
          TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply {
            init(null as KeyStore?)
          }
      val defaultTm =
          defaultTmf.trustManagers.filterIsInstance<X509TrustManager>().firstOrNull()

      val customKeyStore = KeyStore.getInstance(KeyStore.getDefaultType()).apply {
        load(null, null)
        customCerts.forEachIndexed { index, cert ->
          setCertificateEntry("dash-cert-$index", cert)
        }
      }
      val customTmf =
          TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply {
            init(customKeyStore)
          }
      val customTm =
          customTmf.trustManagers.filterIsInstance<X509TrustManager>().firstOrNull()

      val compositeTm =
          object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {
              defaultTm?.checkClientTrusted(chain, authType)
            }

            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
              try {
                defaultTm?.checkServerTrusted(chain, authType)
                return
              } catch (_: Exception) {
                // Fall back to app-trusted local certificate(s)
              }
              if (customTm != null) {
                try {
                  customTm.checkServerTrusted(chain, authType)
                  return
                } catch (_: Exception) {
                  // Also check direct leaf match
                }
              }
              val leaf = chain?.firstOrNull() ?: throw java.security.cert.CertificateException("Empty chain")
              for (anchor in customCerts) {
                if (leaf.encoded.contentEquals(anchor.encoded)) {
                  return
                }
                try {
                  leaf.verify(anchor.publicKey)
                  return
                } catch (_: Exception) {}
              }
              throw java.security.cert.CertificateException("Server certificate not trusted")
            }

            override fun getAcceptedIssuers(): Array<X509Certificate> =
                (defaultTm?.acceptedIssuers ?: emptyArray()) + customCerts
          }

      val sslContext = SSLContext.getInstance("TLS").apply {
        init(null, arrayOf(compositeTm), SecureRandom())
      }
      connection.sslSocketFactory = sslContext.socketFactory
      connection.hostnameVerifier = HostnameVerifier { _, _ -> true }
    } catch (error: Exception) {
      Log.w(TAG, "configureLocalTrustIfPresent failed", error)
    }
  }

  private fun extractHtmlTitle(html: String): String? {
    val match =
        Regex("<title[^>]*>([\\s\\S]*?)</title>", RegexOption.IGNORE_CASE).find(html)
            ?: return null
    val raw = match.groupValues[1].trim()
    if (raw.isEmpty()) {
      return null
    }
    val decoded =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
          Html.fromHtml(raw, Html.FROM_HTML_MODE_LEGACY).toString()
        } else {
          @Suppress("DEPRECATION")
          Html.fromHtml(raw).toString()
        }
    return decoded.replace("\\s+".toRegex(), " ").trim().takeIf { it.isNotEmpty() }
  }

  private fun extractIconHrefs(html: String): List<String> {
    val results = ArrayList<Pair<Int, String>>()
    val linkRegex = Regex("<link\\b[^>]*>", RegexOption.IGNORE_CASE)
    val relRegex = Regex("\\brel\\s*=\\s*(['\"])(.*?)\\1", RegexOption.IGNORE_CASE)
    val hrefRegex = Regex("\\bhref\\s*=\\s*(['\"])(.*?)\\1", RegexOption.IGNORE_CASE)
    val sizesRegex = Regex("\\bsizes\\s*=\\s*(['\"])(.*?)\\1", RegexOption.IGNORE_CASE)

    for (linkMatch in linkRegex.findAll(html)) {
      val tag = linkMatch.value
      val rel = relRegex.find(tag)?.groupValues?.get(2)?.lowercase() ?: continue
      if (!rel.contains("icon")) {
        continue
      }
      val href = hrefRegex.find(tag)?.groupValues?.get(2)?.trim() ?: continue
      if (href.isEmpty()) {
        continue
      }
      val sizesAttr = sizesRegex.find(tag)?.groupValues?.get(2)?.lowercase() ?: ""
      val sizeScore =
          Regex("(\\d+)x\\d+").find(sizesAttr)?.groupValues?.get(1)?.toIntOrNull()
              ?: if (rel.contains("apple-touch-icon")) 180 else 32
      results.add(sizeScore to href)
    }
    return results.sortedByDescending { it.first }.map { it.second }
  }

  private fun resolveUrl(baseUrl: String, relativeOrAbsolute: String): String? {
    return try {
      URI(baseUrl).resolve(relativeOrAbsolute.trim()).toString()
    } catch (_: Exception) {
      null
    }
  }

  private fun sameOrigin(urlA: String, urlB: String): Boolean {
    return try {
      val a = URI(urlA.trim())
      val b = URI(urlB.trim())
      val schemeA = (a.scheme ?: "").lowercase()
      val schemeB = (b.scheme ?: "").lowercase()
      val hostA = (a.host ?: "").lowercase()
      val hostB = (b.host ?: "").lowercase()
      val portA = if (a.port != -1) a.port else defaultPort(schemeA)
      val portB = if (b.port != -1) b.port else defaultPort(schemeB)
      schemeA.isNotEmpty() && hostA.isNotEmpty() && schemeA == schemeB && hostA == hostB && portA == portB
    } catch (_: Exception) {
      false
    }
  }

  private fun defaultPort(scheme: String): Int =
      when (scheme) {
        "http" -> 80
        "https" -> 443
        else -> -1
      }
}
