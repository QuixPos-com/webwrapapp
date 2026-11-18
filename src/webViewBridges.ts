/** Polyfill navigator.clipboard.read() — async Clipboard API is unavailable on http:// WebViews. */
export const CLIPBOARD_BRIDGE_JS = `
  (function () {
    function dbg(stage, extra) {
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'clipboardDebug', stage: stage, extra: extra || null }));
        }
      } catch (e) {}
    }

    if (!window.__dashClipboardPending) {
      window.__dashClipboardPending = new Map();

      if (typeof ClipboardItem === 'undefined') {
        window.ClipboardItem = function (items) {
          this._items = items;
          this.types = Object.keys(items);
        };
        window.ClipboardItem.prototype.getType = function (type) {
          return Promise.resolve(this._items[type]);
        };
      }

      window.__dashClipboardReadResult = function (requestId, dataUri) {
        dbg('result', { requestId: requestId, hasData: !!dataUri, len: dataUri ? dataUri.length : 0 });
        var entry = window.__dashClipboardPending.get(requestId);
        if (!entry) {
          dbg('result_orphan', { requestId: requestId });
          return;
        }
        window.__dashClipboardPending.delete(requestId);
        if (!dataUri) {
          entry.reject(new DOMException('No image on clipboard', 'NotFoundError'));
          return;
        }
        (function dataUriToPngClipboardItems(dataUri) {
          return new Promise(function (resolve, reject) {
            var match = /^data:(image\\/[^;]+);base64,(.*)$/s.exec(dataUri || '');
            if (!match) {
              dbg('bad_data_uri', { prefix: String(dataUri).slice(0, 32) });
              reject(new DOMException('No image on clipboard', 'NotFoundError'));
              return;
            }
            var mime = match[1];
            var raw = match[2];
            if (mime === 'image/png') {
              var binary = atob(raw);
              var bytes = new Uint8Array(binary.length);
              for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              resolve([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })]);
              return;
            }
            var img = new Image();
            img.onload = function () {
              var canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth || img.width;
              canvas.height = img.naturalHeight || img.height;
              canvas.getContext('2d').drawImage(img, 0, 0);
              canvas.toBlob(function (blob) {
                if (!blob) {
                  reject(new DOMException('Could not read clipboard image', 'NotReadableError'));
                  return;
                }
                dbg('converted_blob', { size: blob.size, type: blob.type });
                resolve([new ClipboardItem({ 'image/png': blob })]);
              }, 'image/png');
            };
            img.onerror = function () {
              dbg('image_decode_failed', { mime: mime });
              reject(new DOMException('Could not read clipboard image', 'NotReadableError'));
            };
            img.src = dataUri;
          });
        })(dataUri).then(function (items) {
          dbg('resolve_items', { count: items.length, types: items[0] && items[0].types });
          entry.resolve(items);
        }).catch(function (err) {
          dbg('convert_failed', { message: err && err.message ? err.message : String(err) });
          entry.reject(err);
        });
      };

    }

    var nativeClipboard = navigator.clipboard || {};
    var dashClipboardRead = function () {
      dbg('read_called', { hadNativeRead: typeof nativeClipboard.read === 'function' });
      return new Promise(function (resolve, reject) {
        if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
          dbg('read_no_bridge', null);
          reject(new DOMException('Clipboard unavailable', 'NotSupportedError'));
          return;
        }
        var requestId = String(Date.now()) + ':' + Math.random();
        window.__dashClipboardPending.set(requestId, { resolve: resolve, reject: reject });
        dbg('read_post', { requestId: requestId });
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'clipboardRead', requestId: requestId }));
        setTimeout(function () {
          if (!window.__dashClipboardPending.has(requestId)) return;
          window.__dashClipboardPending.delete(requestId);
          dbg('read_timeout', { requestId: requestId });
          reject(new DOMException('Clipboard read timed out', 'AbortError'));
        }, 15000);
      });
    };

    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        enumerable: true,
        value: {
          read: dashClipboardRead,
          readText: nativeClipboard.readText ? nativeClipboard.readText.bind(nativeClipboard) : undefined,
          write: nativeClipboard.write ? nativeClipboard.write.bind(nativeClipboard) : undefined,
          writeText: nativeClipboard.writeText ? nativeClipboard.writeText.bind(nativeClipboard) : undefined,
        },
      });
      dbg('installed', { readType: typeof navigator.clipboard.read });
    } catch (e) {
      if (!navigator.clipboard) navigator.clipboard = {};
      navigator.clipboard.read = dashClipboardRead;
      dbg('installed_fallback', { message: String(e) });
    }
    window.__dashClipboardBridge = true;
  })();
  true;
`

/** Forward F1–F12 from the page to RN if native dispatch somehow misses them. */
export const FKEY_BRIDGE_JS = `
  (function () {
    if (window.__dashFKeyBridge) return true;
    window.__dashFKeyBridge = true;
    document.addEventListener('keydown', function (e) {
      var m = /^F(\\d{1,2})$/.exec(e.key || '');
      if (!m) return;
      var n = Number(m[1]);
      if (n < 1 || n > 12) return;
      e.preventDefault();
      e.stopPropagation();
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'fkey', key: e.key, n: n }));
      }
    }, true);
  })();
  true;
`

/** Push document.title to RN — navigation title often stays as host/IP after JS sets title. */
export const TITLE_BRIDGE_JS = `
  (function () {
    if (window.__dashTitleBridge) return true;
    window.__dashTitleBridge = true;
    var lastSent = null;
    function postTitle(title) {
      var t = (title == null ? '' : String(title)).trim();
      if (!t || t === lastSent) return;
      lastSent = t;
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pageTitle', title: t }));
      }
    }
    function readTitle() {
      postTitle(document.title);
    }
    try {
      var desc = Object.getOwnPropertyDescriptor(Document.prototype, 'title')
        || Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'title');
      if (desc && desc.set && desc.get) {
        Object.defineProperty(document, 'title', {
          configurable: true,
          enumerable: true,
          get: function () { return desc.get.call(document); },
          set: function (value) {
            desc.set.call(document, value);
            postTitle(value);
          },
        });
      }
    } catch (e) {}
    var titleEl = document.querySelector('title');
    if (titleEl && typeof MutationObserver !== 'undefined') {
      new MutationObserver(readTitle).observe(titleEl, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
    readTitle();
    setTimeout(readTitle, 0);
    setTimeout(readTitle, 250);
    setTimeout(readTitle, 1000);
  })();
  true;
`

export function isUrlLikeTitle(title: string): boolean {
  const t = title.trim()
  if (!t) {
    return true
  }
  if (/^https?:\/\//i.test(t)) {
    return true
  }
  // hostname / IPv4 / IPv4:port / host:port
  if (/^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(t)) {
    return true
  }
  if (/^[a-z0-9.-]+(:\d+)?$/i.test(t) && t.includes('.')) {
    return true
  }
  return false
}

/**
 * Expose window.__dashHost so the embedded web app can detect the RN shell and
 * request a Google ID token via native GoogleSignin (GIS does not work in WebViews).
 */
export const GOOGLE_SIGNIN_BRIDGE_JS = `
  (function () {
    if (window.__dashGoogleSignInBridge) return true;
    window.__dashGoogleSignInBridge = true;

    if (!window.__dashGoogleSignInPending) {
      window.__dashGoogleSignInPending = new Map();
    }

    window.__dashGoogleSignInResult = function (requestId, payload) {
      var entry = window.__dashGoogleSignInPending.get(requestId);
      if (!entry) return;
      window.__dashGoogleSignInPending.delete(requestId);
      if (!payload || payload.error) {
        var code = payload && payload.code === 'cancelled' ? 'cancelled' : 'error';
        var err = new Error((payload && payload.error) || 'Google sign-in failed');
        err.name = code === 'cancelled' ? 'GoogleSignInCancelledError' : 'Error';
        entry.reject(err);
        return;
      }
      entry.resolve(payload.idToken);
    };

    function requestGoogleIdToken(clientId) {
      return new Promise(function (resolve, reject) {
        if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
          reject(new Error('Native Google sign-in bridge unavailable'));
          return;
        }
        if (!clientId) {
          reject(new Error('Google client ID is not configured'));
          return;
        }
        var requestId = String(Date.now()) + ':' + Math.random();
        window.__dashGoogleSignInPending.set(requestId, { resolve: resolve, reject: reject });
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'googleSignIn',
          requestId: requestId,
          clientId: String(clientId),
        }));
        setTimeout(function () {
          if (!window.__dashGoogleSignInPending.has(requestId)) return;
          window.__dashGoogleSignInPending.delete(requestId);
          reject(new Error('Google sign-in timed out'));
        }, 120000);
      });
    }

    window.__dashHost = {
      isDashNative: true,
      platform: 'react-native',
      googleSignIn: true,
      requestGoogleIdToken: requestGoogleIdToken,
    };
  })();
  true;
`

export function buildInjectedJs(applyWebViewScaleJs: string): string {
  return `${CLIPBOARD_BRIDGE_JS}\n${GOOGLE_SIGNIN_BRIDGE_JS}\n${applyWebViewScaleJs}\n${FKEY_BRIDGE_JS}\n${TITLE_BRIDGE_JS}`
}
