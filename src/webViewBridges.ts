/** Polyfill navigator.clipboard (read, readText, write, writeText) & permissions on http/https WebViews. */
export const CLIPBOARD_BRIDGE_JS = `
  (function () {
    function dbg(stage, extra) {
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'clipboardDebug', stage: stage, extra: extra || null }));
        }
      } catch (e) {}
    }

    function createDashClipboardItem(itemsMap) {
      var types = Object.keys(itemsMap);
      if (typeof window.ClipboardItem === 'function') {
        try {
          return new window.ClipboardItem(itemsMap);
        } catch (e) {}
      }
      return {
        _items: itemsMap,
        types: types,
        getType: function (type) {
          var v = itemsMap[type];
          if (!v) {
            return Promise.reject(new DOMException('Type ' + type + ' not found', 'NotFoundError'));
          }
          return Promise.resolve(v);
        },
      };
    }

    if (typeof window.ClipboardItem === 'undefined') {
      window.ClipboardItem = function (items) {
        this._items = items || {};
        this.types = Object.keys(this._items);
      };
      window.ClipboardItem.prototype.getType = function (type) {
        var v = this._items[type];
        if (!v) {
          return Promise.reject(new DOMException('Type ' + type + ' not found', 'NotFoundError'));
        }
        return Promise.resolve(v);
      };
    }

    function dataUriToPngBlob(dataUri) {
      return new Promise(function (resolve, reject) {
        var match = /^data:(image\\/[^;]+);base64,(.*)$/s.exec(dataUri || '');
        if (!match) {
          reject(new DOMException('Invalid clipboard image', 'NotFoundError'));
          return;
        }
        var mime = match[1];
        var raw = match[2];
        if (mime === 'image/png') {
          var binary = atob(raw);
          var bytes = new Uint8Array(binary.length);
          for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          resolve(new Blob([bytes], { type: 'image/png' }));
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
            resolve(blob);
          }, 'image/png');
        };
        img.onerror = function () {
          reject(new DOMException('Could not read clipboard image', 'NotReadableError'));
        };
        img.src = dataUri;
      });
    }

    if (!window.__dashClipboardPending) {
      window.__dashClipboardPending = new Map();
    }

    window.__dashClipboardReadResult = function (requestId, payload) {
      var entry = window.__dashClipboardPending.get(requestId);
      if (!entry) {
        dbg('result_orphan', { requestId: requestId });
        return;
      }
      window.__dashClipboardPending.delete(requestId);

      var dataUri = typeof payload === 'string' ? payload : (payload && payload.imageDataUri) || null;
      var text = payload && typeof payload === 'object' && typeof payload.text === 'string' ? payload.text : null;
      var html = payload && typeof payload === 'object' && typeof payload.html === 'string' ? payload.html : null;

      dbg('result', {
        requestId: requestId,
        hasImage: !!dataUri,
        imageLen: dataUri ? dataUri.length : 0,
        hasText: !!text,
      });

      if (dataUri) {
        dataUriToPngBlob(dataUri)
          .then(function (pngBlob) {
            var map = { 'image/png': pngBlob };
            if (text) {
              map['text/plain'] = new Blob([text], { type: 'text/plain' });
            }
            if (html) {
              map['text/html'] = new Blob([html], { type: 'text/html' });
            }
            entry.resolve([createDashClipboardItem(map)]);
          })
          .catch(function (err) {
            if (text) {
              var fallbackMap = { 'text/plain': new Blob([text], { type: 'text/plain' }) };
              if (html) fallbackMap['text/html'] = new Blob([html], { type: 'text/html' });
              entry.resolve([createDashClipboardItem(fallbackMap)]);
            } else {
              dbg('convert_failed', { message: err && err.message ? err.message : String(err) });
              entry.resolve([]);
            }
          });
        return;
      }

      if (text || html) {
        var textMap = {};
        if (text) textMap['text/plain'] = new Blob([text], { type: 'text/plain' });
        if (html) textMap['text/html'] = new Blob([html], { type: 'text/html' });
        entry.resolve([createDashClipboardItem(textMap)]);
        return;
      }

      entry.resolve([]);
    };

    window.__dashClipboardTextResult = function (requestId, text) {
      var entry = window.__dashClipboardPending.get(requestId);
      if (!entry) return;
      window.__dashClipboardPending.delete(requestId);
      entry.resolve(typeof text === 'string' ? text : '');
    };

    window.__dashClipboardWriteResult = function (requestId, ok) {
      var entry = window.__dashClipboardPending.get(requestId);
      if (!entry) return;
      window.__dashClipboardPending.delete(requestId);
      if (ok === false) {
        entry.reject(new DOMException('Clipboard write failed', 'NotAllowedError'));
      } else {
        entry.resolve(undefined);
      }
    };

    function sendClipboardRequest(msg, timeoutMs) {
      return new Promise(function (resolve, reject) {
        if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
          reject(new DOMException('Clipboard unavailable', 'NotSupportedError'));
          return;
        }
        var requestId = String(Date.now()) + ':' + Math.random();
        window.__dashClipboardPending.set(requestId, { resolve: resolve, reject: reject });
        var fullMsg = Object.assign({}, msg, { requestId: requestId });
        window.ReactNativeWebView.postMessage(JSON.stringify(fullMsg));
        setTimeout(function () {
          if (!window.__dashClipboardPending.has(requestId)) return;
          window.__dashClipboardPending.delete(requestId);
          reject(new DOMException('Clipboard operation timed out', 'AbortError'));
        }, timeoutMs || 15000);
      });
    }

    var dashClipboardRead = function () {
      dbg('read_called', null);
      return sendClipboardRequest({ type: 'clipboardRead' }, 15000);
    };

    var dashClipboardReadText = function () {
      dbg('readText_called', null);
      return sendClipboardRequest({ type: 'clipboardReadText' }, 10000);
    };

    var dashClipboardWriteText = function (text) {
      var str = text == null ? '' : String(text);
      dbg('writeText_called', { len: str.length });
      return sendClipboardRequest({ type: 'clipboardWriteText', text: str }, 10000);
    };

    function blobToDataUri(blob) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onloadend = function () { resolve(reader.result); };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    var dashClipboardWrite = function (items) {
      dbg('write_called', { count: items ? items.length : 0 });
      var list = Array.isArray(items) ? items : [];
      if (!list.length) {
        return Promise.resolve(undefined);
      }
      var item = list[0];
      var types = (item && item.types) || [];
      var textPromise = types.indexOf('text/plain') !== -1 && typeof item.getType === 'function'
        ? Promise.resolve(item.getType('text/plain')).then(function (b) { return b && b.text ? b.text() : ''; }).catch(function () { return null; })
        : Promise.resolve(null);

      var imgType = null;
      for (var i = 0; i < types.length; i++) {
        if (String(types[i]).indexOf('image/') === 0) {
          imgType = types[i];
          break;
        }
      }
      var imgPromise = imgType && typeof item.getType === 'function'
        ? Promise.resolve(item.getType(imgType)).then(blobToDataUri).catch(function () { return null; })
        : Promise.resolve(null);

      return Promise.all([textPromise, imgPromise]).then(function (res) {
        return sendClipboardRequest({
          type: 'clipboardWrite',
          text: res[0],
          imageDataUri: res[1],
        }, 15000);
      });
    };

    if (typeof window.Clipboard !== 'undefined' && window.Clipboard.prototype) {
      try {
        window.Clipboard.prototype.read = dashClipboardRead;
        window.Clipboard.prototype.readText = dashClipboardReadText;
        window.Clipboard.prototype.write = dashClipboardWrite;
        window.Clipboard.prototype.writeText = dashClipboardWriteText;
      } catch (e) {}
    }

    var clipboardObj = {
      read: dashClipboardRead,
      readText: dashClipboardReadText,
      write: dashClipboardWrite,
      writeText: dashClipboardWriteText,
      addEventListener: function () {},
      removeEventListener: function () {},
      dispatchEvent: function () { return true; },
    };

    try {
      Object.defineProperty(window, 'isSecureContext', {
        configurable: true,
        enumerable: true,
        get: function () { return true; },
      });
    } catch (e) {}

    if (typeof Navigator !== 'undefined' && Navigator.prototype) {
      try {
        Object.defineProperty(Navigator.prototype, 'clipboard', {
          configurable: true,
          enumerable: true,
          get: function () { return clipboardObj; },
        });
      } catch (e) {}
    }

    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        enumerable: true,
        get: function () { return clipboardObj; },
      });
      dbg('installed', { readType: typeof navigator.clipboard.read });
    } catch (e) {
      try {
        navigator.clipboard = clipboardObj;
      } catch (e2) {}
      if (navigator.clipboard) {
        try {
          navigator.clipboard.read = dashClipboardRead;
          navigator.clipboard.readText = dashClipboardReadText;
          navigator.clipboard.write = dashClipboardWrite;
          navigator.clipboard.writeText = dashClipboardWriteText;
        } catch (e3) {}
      }
      dbg('installed_fallback', { message: String(e) });
    }

    if (navigator.permissions && typeof navigator.permissions.query === 'function' && !window.__dashPermissionsPatched) {
      window.__dashPermissionsPatched = true;
      var origQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = function (descriptor) {
        var name = descriptor && descriptor.name ? String(descriptor.name) : '';
        if (name === 'clipboard-read' || name === 'clipboard-write' || name === 'clipboard-sanitized-write') {
          return Promise.resolve({
            state: 'granted',
            name: name,
            onchange: null,
            addEventListener: function () {},
            removeEventListener: function () {},
            dispatchEvent: function () { return true; },
          });
        }
        return origQuery(descriptor);
      };
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
    if (window.__dashTitleBridge) {
      if (typeof window.__dashReadTitle === 'function') window.__dashReadTitle();
      return true;
    }
    window.__dashTitleBridge = true;
    var lastSent = null;
    function getBestPageTitle() {
      var raw = document.title ? String(document.title).trim() : '';
      if (raw) return raw;
      var meta = document.querySelector(
        'meta[name="application-name"][content], meta[property="og:site_name"][content], meta[property="og:title"][content]'
      );
      return meta ? String(meta.getAttribute('content') || '').trim() : '';
    }
    function postTitle(title) {
      var t = (title == null ? '' : String(title)).trim();
      if (!t || t === lastSent) return;
      lastSent = t;
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pageTitle', title: t }));
      }
    }
    function readTitle() {
      postTitle(getBestPageTitle());
    }
    window.__dashReadTitle = readTitle;
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
    function attachObserver() {
      if (window.__dashTitleObserverAttached || typeof MutationObserver === 'undefined') return;
      var root = document.head || document.documentElement;
      if (!root) return;
      window.__dashTitleObserverAttached = true;
      new MutationObserver(readTitle).observe(root, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
    attachObserver();
    document.addEventListener('DOMContentLoaded', function () {
      attachObserver();
      readTitle();
    });
    window.addEventListener('load', function () {
      attachObserver();
      readTitle();
    });
    readTitle();
    setTimeout(readTitle, 0);
    setTimeout(readTitle, 250);
    setTimeout(readTitle, 1000);
  })();
  true;
`

/** Discover the website's favicon / touch icon, rasterize to PNG when possible, and push to RN. */
export const FAVICON_BRIDGE_JS = `
  (function () {
    if (window.__dashFaviconBridge) {
      if (typeof window.__dashReadFavicon === 'function') window.__dashReadFavicon();
      return true;
    }
    window.__dashFaviconBridge = true;
    var lastResolvedKey = null;
    var resolving = false;

    function collectCandidates() {
      var links = Array.prototype.slice.call(
        document.querySelectorAll('link[rel][href]')
      );
      var scored = [];
      for (var i = 0; i < links.length; i++) {
        var link = links[i];
        var rel = String(link.getAttribute('rel') || '').toLowerCase();
        if (rel.indexOf('icon') === -1) continue;
        var href = link.href || link.getAttribute('href') || '';
        if (!href) continue;
        try {
          href = new URL(href, window.location.href).href;
        } catch (e) { continue; }
        var sizes = String(link.getAttribute('sizes') || '').toLowerCase();
        var type = String(link.getAttribute('type') || '').toLowerCase();
        var score = 32;
        var m = /(\\d+)x\\d+/.exec(sizes);
        if (m) {
          score = Math.min(512, parseInt(m[1], 10) || 32);
        } else if (sizes === 'any' || type.indexOf('svg') !== -1 || /\\.svg(\\?|$)/i.test(href)) {
          score = 256;
        } else if (rel.indexOf('apple-touch-icon') !== -1) {
          score = 180;
        }
        scored.push({ href: href, score: score });
      }
      scored.sort(function (a, b) { return b.score - a.score; });
      var unique = [];
      var seen = {};
      for (var j = 0; j < scored.length; j++) {
        var u = scored[j].href;
        if (!seen[u]) {
          seen[u] = true;
          unique.push(u);
        }
      }
      try {
        var defaultFavicon = new URL('/favicon.ico', window.location.href).href;
        if (!seen[defaultFavicon]) {
          unique.push(defaultFavicon);
        }
      } catch (e) {}
      return unique;
    }

    function renderImageSourceToPng(src) {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () {
          try {
            var size = 192;
            var canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            var ctx = canvas.getContext('2d');
            var w = img.naturalWidth || img.width || size;
            var h = img.naturalHeight || img.height || size;
            var scale = Math.min(size / w, size / h);
            var dw = w * scale;
            var dh = h * scale;
            var dx = (size - dw) / 2;
            var dy = (size - dh) / 2;
            ctx.drawImage(img, dx, dy, dw, dh);
            var png = canvas.toDataURL('image/png');
            if (png && png.indexOf('data:image/png;base64,') === 0 && png.length > 64) {
              resolve(png);
            } else {
              reject(new Error('Empty canvas output'));
            }
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = function () {
          reject(new Error('Image load failed'));
        };
        img.src = src;
      });
    }

    function fetchCandidateAsPng(url) {
      if (/^data:image\\//i.test(url)) {
        return renderImageSourceToPng(url);
      }
      return fetch(url, { credentials: 'include' })
        .then(function (resp) {
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          return resp.blob();
        })
        .then(function (blob) {
          if (!blob || blob.size === 0) throw new Error('Empty blob');
          var objUrl = URL.createObjectURL(blob);
          return renderImageSourceToPng(objUrl).finally(function () {
            try { URL.revokeObjectURL(objUrl); } catch (e) {}
          });
        });
    }

    function postFavicon(iconUrl, dataUri) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'pageFavicon',
          iconUrl: iconUrl || null,
          dataUri: dataUri || null,
        }));
      }
    }

    function resolveFavicon() {
      if (resolving) return;
      var candidates = collectCandidates();
      if (!candidates.length) return;
      var key = candidates.join('|');
      if (key === lastResolvedKey) return;
      resolving = true;

      var idx = 0;
      function tryNext() {
        if (idx >= candidates.length) {
          resolving = false;
          lastResolvedKey = key;
          postFavicon(candidates[0], null);
          return;
        }
        var current = candidates[idx++];
        fetchCandidateAsPng(current)
          .then(function (dataUri) {
            resolving = false;
            lastResolvedKey = key;
            postFavicon(current, dataUri);
          })
          .catch(function () {
            tryNext();
          });
      }
      tryNext();
    }

    window.__dashReadFavicon = resolveFavicon;
    function attachHeadObserver() {
      if (window.__dashFaviconObserverAttached || typeof MutationObserver === 'undefined') return;
      var head = document.head || document.documentElement;
      if (!head) return;
      window.__dashFaviconObserverAttached = true;
      new MutationObserver(function () {
        resolveFavicon();
      }).observe(head, {
        childList: true,
        attributes: true,
        subtree: true,
        attributeFilter: ['href', 'rel', 'sizes'],
      });
    }
    attachHeadObserver();
    document.addEventListener('DOMContentLoaded', function () {
      attachHeadObserver();
      resolveFavicon();
    });
    window.addEventListener('load', function () {
      attachHeadObserver();
      resolveFavicon();
    });
    setTimeout(resolveFavicon, 150);
    setTimeout(resolveFavicon, 1000);
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
  return `${CLIPBOARD_BRIDGE_JS}\n${GOOGLE_SIGNIN_BRIDGE_JS}\n${applyWebViewScaleJs}\n${FKEY_BRIDGE_JS}\n${TITLE_BRIDGE_JS}\n${FAVICON_BRIDGE_JS}`
}
