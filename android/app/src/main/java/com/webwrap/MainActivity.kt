package com.webwrap

import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import androidx.core.view.WindowCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.bridge.Arguments
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.modules.core.DeviceEventManagerModule

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "WebWrap"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // Keep content below the status bar / clock (Android 15+ otherwise forces edge-to-edge).
    WindowCompat.setDecorFitsSystemWindows(window, true)
    DashAppIdentity.applyToActivity(this)
  }

  override fun onResume() {
    super.onResume()
    DashAppIdentity.applyToActivity(this)
  }

  /**
   * Intercept before the focused WebView can consume shortcuts.
   * Activity.onKeyDown only runs if no child handled the event — WebView usually does.
   */
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val type = when (event.action) {
      KeyEvent.ACTION_DOWN -> "keydown"
      KeyEvent.ACTION_UP -> "keyup"
      else -> return super.dispatchKeyEvent(event)
    }

    // Ctrl+1..9 / Ctrl+0 / Ctrl+- / Ctrl+= — reliable on emulator host keyboards.
    // F1–F12 often never leave the emulator UI unless shortcuts are sent to the AVD.
    val ctrlTab = if (event.isCtrlPressed) tabIndexForCtrlKey(event.keyCode) else null
    if (ctrlTab != null) {
      if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
        Log.d(TAG, "ctrlTab $ctrlTab")
        emitHardwareKey("F$ctrlTab", "keydown", event.keyCode)
      }
      return true
    }

    val key = keyNameForCode(event.keyCode)
    if (key != null) {
      val isArrowKey = isArrowKeyCode(event.keyCode)
      if (!isArrowKey && event.action == KeyEvent.ACTION_DOWN && event.repeatCount > 0) {
        return true
      }
      Log.d(TAG, "hardwareKey $key $type (${event.keyCode})")
      emitHardwareKey(key, type, event.keyCode)
      return true
    }

    return super.dispatchKeyEvent(event)
  }

  private fun tabIndexForCtrlKey(keyCode: Int): Int? = when (keyCode) {
    KeyEvent.KEYCODE_1 -> 1
    KeyEvent.KEYCODE_2 -> 2
    KeyEvent.KEYCODE_3 -> 3
    KeyEvent.KEYCODE_4 -> 4
    KeyEvent.KEYCODE_5 -> 5
    KeyEvent.KEYCODE_6 -> 6
    KeyEvent.KEYCODE_7 -> 7
    KeyEvent.KEYCODE_8 -> 8
    KeyEvent.KEYCODE_9 -> 9
    KeyEvent.KEYCODE_0 -> 10
    KeyEvent.KEYCODE_MINUS -> 11
    KeyEvent.KEYCODE_EQUALS -> 12
    else -> null
  }

  private fun keyNameForCode(keyCode: Int): String? = when (keyCode) {
    KeyEvent.KEYCODE_ESCAPE -> "Escape"
    KeyEvent.KEYCODE_DPAD_UP -> "ArrowUp"
    KeyEvent.KEYCODE_DPAD_DOWN -> "ArrowDown"
    KeyEvent.KEYCODE_DPAD_LEFT -> "ArrowLeft"
    KeyEvent.KEYCODE_DPAD_RIGHT -> "ArrowRight"
    KeyEvent.KEYCODE_F1 -> "F1"
    KeyEvent.KEYCODE_F2 -> "F2"
    KeyEvent.KEYCODE_F3 -> "F3"
    KeyEvent.KEYCODE_F4 -> "F4"
    KeyEvent.KEYCODE_F5 -> "F5"
    KeyEvent.KEYCODE_F6 -> "F6"
    KeyEvent.KEYCODE_F7 -> "F7"
    KeyEvent.KEYCODE_F8 -> "F8"
    KeyEvent.KEYCODE_F9 -> "F9"
    KeyEvent.KEYCODE_F10 -> "F10"
    KeyEvent.KEYCODE_F11 -> "F11"
    KeyEvent.KEYCODE_F12 -> "F12"
    else -> null
  }

  private fun isArrowKeyCode(keyCode: Int): Boolean = when (keyCode) {
    KeyEvent.KEYCODE_DPAD_UP,
    KeyEvent.KEYCODE_DPAD_DOWN,
    KeyEvent.KEYCODE_DPAD_LEFT,
    KeyEvent.KEYCODE_DPAD_RIGHT -> true
    else -> false
  }

  private fun emitHardwareKey(key: String, type: String, keyCode: Int) {
    val reactContext = reactActivityDelegate.currentReactContext
    if (reactContext == null) {
      Log.w(TAG, "No React context yet; dropped $key")
      return
    }
    val payload = Arguments.createMap().apply {
      putString("key", key)
      putString("type", type)
      putInt("keyCode", keyCode)
    }
    reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("hardwareKey", payload)
  }

  companion object {
    private const val TAG = "WebWrapKeys"
  }
}
