package com.webwrap

import android.content.ClipData
import android.content.ClipDescription
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.util.Base64
import android.util.Log
import android.util.Size
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.regex.Pattern
import org.json.JSONArray
import org.json.JSONObject

class DashClipboardModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private var cachedImageDataUri: String? = null
  private var cachedImageAtMs: Long = 0
  private var cachedText: String? = null
  private var cachedHtml: String? = null
  private var clipListener: android.content.ClipboardManager.OnPrimaryClipChangedListener? = null

  override fun getName(): String = NAME

  override fun initialize() {
    super.initialize()
    val clipboard = clipboardManager() ?: return
    clipListener =
        android.content.ClipboardManager.OnPrimaryClipChangedListener {
          try {
            val description = describeClipboardJson()
            Log.i(TAG, "clipboard changed: $description")
            val text = readPrimaryClipText()
            if (text != null) {
              cachedText = text
            }
            val html = readPrimaryClipHtml()
            if (html != null) {
              cachedHtml = html
            }
            val image = readPrimaryClipImage()
            if (image != null) {
              cachedImageDataUri = image
              cachedImageAtMs = System.currentTimeMillis()
              Log.i(TAG, "clipboard changed: cached image len=${image.length}")
            }
          } catch (error: Exception) {
            Log.w(TAG, "clipboard listener failed", error)
          }
        }
    clipboard.addPrimaryClipChangedListener(clipListener!!)
  }

  override fun invalidate() {
    clipListener?.let { listener -> clipboardManager()?.removePrimaryClipChangedListener(listener) }
    clipListener = null
    super.invalidate()
  }

  @ReactMethod
  fun describeClipboard(promise: Promise) {
    try {
      promise.resolve(describeClipboardJson())
    } catch (error: Exception) {
      promise.reject("dash_clipboard_describe_failed", error)
    }
  }

  @ReactMethod
  fun getImageDataUri(promise: Promise) {
    try {
      val fresh = readPrimaryClipImage()
      if (fresh != null) {
        cachedImageDataUri = fresh
        cachedImageAtMs = System.currentTimeMillis()
        Log.d(TAG, "getImageDataUri: fresh image len=${fresh.length}")
        promise.resolve(fresh)
        return
      }

      if (cachedImageDataUri != null && isCacheFresh()) {
        Log.d(
            TAG,
            "getImageDataUri: using cached image len=${cachedImageDataUri!!.length} (clip may have been overwritten)",
        )
        promise.resolve(cachedImageDataUri)
        return
      }

      Log.w(TAG, "getImageDataUri: no image — ${describeClipboardJson()}")
      promise.resolve(null)
    } catch (error: Exception) {
      Log.e(TAG, "getImageDataUri failed", error)
      promise.reject("dash_clipboard_read_failed", error)
    }
  }

  @ReactMethod
  fun getClipboardContent(promise: Promise) {
    try {
      val image =
          readPrimaryClipImage()?.also {
            cachedImageDataUri = it
            cachedImageAtMs = System.currentTimeMillis()
          } ?: if (isCacheFresh()) cachedImageDataUri else null

      val text = readPrimaryClipText()?.also { cachedText = it } ?: cachedText
      val html = readPrimaryClipHtml()?.also { cachedHtml = it } ?: cachedHtml

      val map = Arguments.createMap().apply {
        if (image != null) putString("imageDataUri", image) else putNull("imageDataUri")
        if (text != null) putString("text", text) else putNull("text")
        if (html != null) putString("html", html) else putNull("html")
      }
      promise.resolve(map)
    } catch (error: Exception) {
      Log.e(TAG, "getClipboardContent failed", error)
      promise.reject("dash_clipboard_content_failed", error)
    }
  }

  @ReactMethod
  fun getText(promise: Promise) {
    try {
      val text = readPrimaryClipText()?.also { cachedText = it } ?: cachedText ?: ""
      promise.resolve(text)
    } catch (error: Exception) {
      Log.e(TAG, "getText failed", error)
      promise.reject("dash_clipboard_text_failed", error)
    }
  }

  @ReactMethod
  fun setText(text: String, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        val clipboard = clipboardManager()
        if (clipboard != null) {
          clipboard.setPrimaryClip(ClipData.newPlainText("text", text))
          cachedText = text
        }
        promise.resolve(true)
      } catch (error: Exception) {
        Log.e(TAG, "setText failed", error)
        promise.reject("dash_clipboard_set_text_failed", error)
      }
    }
  }

  @ReactMethod
  fun setImageDataUri(dataUri: String, promise: Promise) {
    try {
      if (dataUri.startsWith("data:image/")) {
        cachedImageDataUri = dataUri
        cachedImageAtMs = System.currentTimeMillis()
      }
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("dash_clipboard_set_image_failed", error)
    }
  }

  private fun readPrimaryClipText(): String? {
    val clipboard = clipboardManager() ?: return null
    if (!clipboard.hasPrimaryClip()) {
      return null
    }
    val clip = clipboard.primaryClip ?: return null
    for (index in 0 until clip.itemCount) {
      val item = clip.getItemAt(index)
      val direct = item.text?.toString()
      if (!direct.isNullOrEmpty()) {
        return direct
      }
      val coerced = item.coerceToText(reactApplicationContext)?.toString()
      if (!coerced.isNullOrEmpty()) {
        return coerced
      }
    }
    return null
  }

  private fun readPrimaryClipHtml(): String? {
    val clipboard = clipboardManager() ?: return null
    if (!clipboard.hasPrimaryClip()) {
      return null
    }
    val clip = clipboard.primaryClip ?: return null
    for (index in 0 until clip.itemCount) {
      val html = clip.getItemAt(index).htmlText
      if (!html.isNullOrEmpty()) {
        return html
      }
    }
    return null
  }

  private fun isCacheFresh(): Boolean =
      cachedImageDataUri != null &&
          System.currentTimeMillis() - cachedImageAtMs <= CACHE_TTL_MS

  private fun readPrimaryClipImage(): String? {
    val clipboard = clipboardManager() ?: return null
    if (!clipboard.hasPrimaryClip()) {
      return null
    }
    val clip = clipboard.primaryClip ?: return null
    val description = clip.description
    if (description != null && descriptionHasImageMime(description)) {
      Log.d(TAG, "readPrimaryClipImage: clip declares image mime types")
    }
    val resolver = reactApplicationContext.contentResolver
    for (index in 0 until clip.itemCount) {
      readImageFromClipItem(reactApplicationContext, resolver, clip.getItemAt(index))?.let {
        return it
      }
    }
    return null
  }

  private fun descriptionHasImageMime(description: ClipDescription): Boolean {
    for (index in 0 until description.mimeTypeCount) {
      val mime = description.getMimeType(index) ?: continue
      if (mime.startsWith("image/") || mime == ClipDescription.MIMETYPE_TEXT_URILIST) {
        return true
      }
    }
    return false
  }

  private fun clipboardManager(): android.content.ClipboardManager? =
      reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as? android.content.ClipboardManager

  private fun describeClipboardJson(): String {
    val root = JSONObject()
    val clipboard = clipboardManager()
    if (clipboard == null) {
      root.put("error", "no clipboard service")
      return root.toString()
    }

    root.put("hasPrimaryClip", clipboard.hasPrimaryClip())
    root.put("hasCachedImage", cachedImageDataUri != null)
    if (!clipboard.hasPrimaryClip()) {
      return root.toString()
    }

    val clip = clipboard.primaryClip
    if (clip == null) {
      root.put("error", "primary clip null")
      return root.toString()
    }

    val description = clip.description
    val mimeTypes = JSONArray()
    if (description != null) {
      for (index in 0 until description.mimeTypeCount) {
        mimeTypes.put(description.getMimeType(index))
      }
      root.put("label", description.label?.toString())
    }
    root.put("mimeTypes", mimeTypes)
    root.put("itemCount", clip.itemCount)

    val items = JSONArray()
    val resolver = reactApplicationContext.contentResolver
    for (index in 0 until clip.itemCount) {
      val item = clip.getItemAt(index)
      val entry = JSONObject()
      entry.put("uri", item.uri?.toString())
      entry.put("intentData", item.intent?.dataString)
      entry.put("intentStream", streamUriFromIntent(item.intent)?.toString())
      entry.put("textPreview", preview(item.text?.toString()))
      entry.put("htmlPreview", preview(item.htmlText?.toString()))
      entry.put("coercedTextPreview", preview(item.coerceToText(reactApplicationContext)?.toString()))
      entry.put("coercedHtmlPreview", preview(item.coerceToHtmlText(reactApplicationContext)))
      entry.put("htmlHttpSrc", extractHttpUrlFromHtml(item.htmlText?.toString().orEmpty()))
      entry.put("resolverMime", item.uri?.let { resolver.getType(it) })
      items.put(entry)
    }
    root.put("items", items)
    return root.toString()
  }

  private fun preview(value: String?): String {
    if (value.isNullOrEmpty()) {
      return ""
    }
    return if (value.length <= 120) value else value.take(120) + "…"
  }

  private fun streamUriFromIntent(intent: Intent?): Uri? {
    if (intent == null) {
      return null
    }
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(Intent.EXTRA_STREAM)
    }
  }

  private fun readImageFromClipItem(
      context: ReactApplicationContext,
      resolver: ContentResolver,
      item: ClipData.Item,
  ): String? {
    val uris = linkedSetOf<Uri?>()
    uris.add(item.uri)
    item.intent?.let { intent ->
      uris.add(intent.data)
      uris.add(streamUriFromIntent(intent))
    }

    for (uri in uris) {
      if (uri != null) {
        readImageFromUri(resolver, uri)?.let { return it }
      }
    }

    val text = item.text?.toString()?.trim()
    if (!text.isNullOrEmpty() && text.startsWith("data:image/")) {
      return text
    }

    val coercedText = item.coerceToText(context)?.toString()?.trim()
    if (!coercedText.isNullOrEmpty()) {
      if (coercedText.startsWith("data:image/")) {
        return coercedText
      }
      if (coercedText.startsWith("content://") ||
          coercedText.startsWith("file://") ||
          coercedText.startsWith("http://") ||
          coercedText.startsWith("https://")) {
        if (coercedText.startsWith("http")) {
          readImageFromHttpUrl(coercedText)?.let { return it }
        } else {
          readImageFromUri(resolver, Uri.parse(coercedText))?.let { return it }
        }
      }
    }

    val htmlSources = listOf(item.htmlText?.toString(), item.coerceToHtmlText(context))
    for (html in htmlSources) {
      if (!html.isNullOrEmpty()) {
        extractDataUriFromHtml(html)?.let { return it }
        extractContentUriFromHtml(html)?.let { uri ->
          readImageFromUri(resolver, uri)?.let { return it }
        }
        extractHttpUrlFromHtml(html)?.let { url ->
          readImageFromHttpUrl(url)?.let { return it }
        }
      }
    }

    return null
  }

  private fun extractContentUriFromHtml(html: String): Uri? {
    val matcher = IMG_SRC.matcher(html)
    while (matcher.find()) {
      val src = matcher.group(1)?.trim().orEmpty()
      if (src.startsWith("content://") || src.startsWith("file://")) {
        return Uri.parse(src)
      }
    }
    return null
  }

  private fun extractHttpUrlFromHtml(html: String): String? {
    val matcher = IMG_SRC.matcher(html)
    while (matcher.find()) {
      val src = matcher.group(1)?.trim().orEmpty()
      if (src.startsWith("http://") || src.startsWith("https://")) {
        return src
      }
    }
    return null
  }

  private fun readImageFromHttpUrl(url: String): String? {
    return try {
      val connection = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = 8000
        readTimeout = 8000
        instanceFollowRedirects = true
      }
      connection.inputStream.use { input ->
        val bitmap = decodeBitmap(input) ?: return null
        val mimeType = connection.contentType?.substringBefore(';')?.trim().orEmpty()
        val normalizedMime = if (mimeType.startsWith("image/")) mimeType else "image/jpeg"
        bitmapToDataUri(bitmap, normalizedMime)
      }
    } catch (error: Exception) {
      Log.w(TAG, "readImageFromHttpUrl failed for $url", error)
      null
    }
  }

  private fun extractDataUriFromHtml(html: String): String? {
    val matcher = DATA_URI_IN_HTML.matcher(html)
    return if (matcher.find()) matcher.group(0) else null
  }

  private fun readImageFromUri(resolver: ContentResolver, uri: Uri): String? {
    Log.d(TAG, "readImageFromUri: $uri type=${resolver.getType(uri)}")

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      try {
        val thumb = resolver.loadThumbnail(uri, Size(2048, 2048), null)
        return bitmapToDataUri(thumb, resolver.getType(uri) ?: "image/jpeg")
      } catch (error: Exception) {
        Log.d(TAG, "loadThumbnail failed for $uri: ${error.message}")
      }
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      try {
        val source = ImageDecoder.createSource(resolver, uri)
        val bitmap = ImageDecoder.decodeBitmap(source)
        return bitmapToDataUri(bitmap, resolver.getType(uri) ?: "image/jpeg")
      } catch (error: Exception) {
        Log.d(TAG, "ImageDecoder failed for $uri: ${error.message}")
      }
    }

    try {
      resolver.openTypedAssetFileDescriptor(uri, "image/*", null)?.use { afd ->
        afd.createInputStream().use { input ->
          decodeBitmap(input)?.let { bitmap ->
            return bitmapToDataUri(bitmap, resolver.getType(uri) ?: "image/jpeg")
          }
        }
      }
    } catch (error: Exception) {
      Log.d(TAG, "openTypedAssetFileDescriptor failed for $uri: ${error.message}")
    }

    var mimeType = resolver.getType(uri)
    val bitmap =
        try {
          resolver.openInputStream(uri)?.use { input -> decodeBitmap(input) }
        } catch (error: Exception) {
          Log.w(TAG, "openInputStream failed for $uri: ${error.message}")
          null
        } ?: return null

    if (mimeType.isNullOrBlank() || !mimeType.startsWith("image/")) {
      mimeType = "image/jpeg"
    }
    return bitmapToDataUri(bitmap, mimeType)
  }

  private fun decodeBitmap(input: InputStream): Bitmap? = BitmapFactory.decodeStream(input)

  private fun bitmapToDataUri(bitmap: Bitmap, mimeType: String): String {
    val maxEdge = 1600
    val scaled =
        if (bitmap.width > maxEdge || bitmap.height > maxEdge) {
          val scale = maxEdge.toFloat() / maxOf(bitmap.width, bitmap.height)
          val width = (bitmap.width * scale).toInt().coerceAtLeast(1)
          val height = (bitmap.height * scale).toInt().coerceAtLeast(1)
          Bitmap.createScaledBitmap(bitmap, width, height, true)
        } else {
          bitmap
        }

    val outputStream = ByteArrayOutputStream()
    scaled.compress(Bitmap.CompressFormat.PNG, 100, outputStream)
    if (scaled !== bitmap) {
      scaled.recycle()
    }
    val encoded = Base64.encodeToString(outputStream.toByteArray(), Base64.NO_WRAP)
    return "data:image/png;base64,$encoded"
  }

  companion object {
    const val NAME = "DashClipboard"
    private const val TAG = "DashClipboard"
    private const val CACHE_TTL_MS = 10 * 60 * 1000L
    private val DATA_URI_IN_HTML =
        Pattern.compile("data:image/[^;\\s\"']+;base64,[A-Za-z0-9+/=]+")
    private val IMG_SRC =
        Pattern.compile("""<img[^>]+src=["']([^"']+)["']""", Pattern.CASE_INSENSITIVE)
  }
}
