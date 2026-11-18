import React, { useCallback } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import type { Tab } from './tabs'
import {
  ClipboardContent,
  readClipboardContent,
  readClipboardText,
  writeClipboardImageDataUri,
  writeClipboardText,
} from './dashClipboard'
import {
  formatGoogleSignInError,
  requestNativeGoogleIdToken,
} from './dashGoogleSignIn'

type WebViewSource = { uri: string; headers?: Record<string, string> }

type DashWebViewsProps = {
  tabs: Tab[]
  activeTabId: string
  webViewSource: WebViewSource
  webViewReloadToken: number
  injectedJs: string
  applyWebViewScaleJs: string
  webRefs: React.MutableRefObject<Record<string, WebView<{}> | null>>
  activeTabIdRef: React.MutableRefObject<string>
  focusActiveWebView: (tabId?: string) => void
  selectOrCreateTab: (count: number) => void
  onTabTitle: (tabId: string, title: string | undefined) => void
  onPageFavicon?: (iconUrl: string | null, dataUri: string | null) => void
}

export function DashWebViews({
  tabs,
  activeTabId,
  webViewSource,
  webViewReloadToken,
  injectedJs,
  applyWebViewScaleJs,
  webRefs,
  activeTabIdRef,
  focusActiveWebView,
  selectOrCreateTab,
  onTabTitle,
  onPageFavicon,
}: DashWebViewsProps): React.JSX.Element {
  const respondClipboardRead = useCallback(
    (tabId: string, requestId: string, content: ClipboardContent) => {
      console.log(
        `[dash-clipboard] respond tab=${tabId} requestId=${requestId} imgBytes=${content.imageDataUri?.length ?? 0} textLen=${content.text?.length ?? 0}`,
      )
      const webView = webRefs.current[tabId]
      if (!webView) {
        console.log(`[dash-clipboard] respond: no webview for tab ${tabId}`)
        return
      }
      const js = `
        window.__dashClipboardReadResult(${JSON.stringify(requestId)}, ${JSON.stringify(content)});
        true;
      `
      webView.injectJavaScript(js)
    },
    [webRefs],
  )

  const handleClipboardRead = useCallback(
    (tabId: string, requestId: string) => {
      ;(async () => {
        try {
          const content = await readClipboardContent()
          respondClipboardRead(tabId, requestId, content)
        } catch (error) {
          console.log('[dash-clipboard] handle failed:', error)
          respondClipboardRead(tabId, requestId, { imageDataUri: null, text: null, html: null })
        }
      })()
    },
    [respondClipboardRead],
  )

  const handleClipboardReadText = useCallback(
    (tabId: string, requestId: string) => {
      ;(async () => {
        try {
          const text = await readClipboardText()
          webRefs.current[tabId]?.injectJavaScript(`
            window.__dashClipboardTextResult(${JSON.stringify(requestId)}, ${JSON.stringify(text)});
            true;
          `)
        } catch (error) {
          console.log('[dash-clipboard] readText failed:', error)
          webRefs.current[tabId]?.injectJavaScript(`
            window.__dashClipboardTextResult(${JSON.stringify(requestId)}, "");
            true;
          `)
        }
      })()
    },
    [webRefs],
  )

  const handleClipboardWrite = useCallback(
    (tabId: string, requestId: string, text: string | null, imageDataUri: string | null) => {
      ;(async () => {
        try {
          if (typeof text === 'string') {
            await writeClipboardText(text)
          }
          if (typeof imageDataUri === 'string' && imageDataUri.length > 0) {
            await writeClipboardImageDataUri(imageDataUri)
          }
          webRefs.current[tabId]?.injectJavaScript(`
            window.__dashClipboardWriteResult(${JSON.stringify(requestId)}, true);
            true;
          `)
        } catch (error) {
          console.log('[dash-clipboard] write failed:', error)
          webRefs.current[tabId]?.injectJavaScript(`
            window.__dashClipboardWriteResult(${JSON.stringify(requestId)}, false);
            true;
          `)
        }
      })()
    },
    [webRefs],
  )

  const respondGoogleSignIn = useCallback(
    (
      tabId: string,
      requestId: string,
      payload: { idToken?: string; error?: string; code?: 'cancelled' | 'error' },
    ) => {
      const webView = webRefs.current[tabId]
      if (!webView) {
        return
      }
      webView.injectJavaScript(`
        window.__dashGoogleSignInResult(${JSON.stringify(requestId)}, ${JSON.stringify(payload)});
        true;
      `)
    },
    [webRefs],
  )

  const handleGoogleSignIn = useCallback(
    (tabId: string, requestId: string, clientId: string) => {
      ;(async () => {
        try {
          const idToken = await requestNativeGoogleIdToken(clientId)
          respondGoogleSignIn(tabId, requestId, { idToken })
        } catch (error) {
          console.log('[dash-google] sign-in failed:', error)
          const formatted = formatGoogleSignInError(error)
          respondGoogleSignIn(tabId, requestId, {
            error: formatted.message,
            code: formatted.code,
          })
        }
      })()
    },
    [respondGoogleSignIn],
  )

  const applyWebViewScale = useCallback(
    (tabId?: string) => {
      const ids = tabId ? [tabId] : Object.keys(webRefs.current)
      for (const id of ids) {
        webRefs.current[id]?.injectJavaScript(applyWebViewScaleJs)
      }
    },
    [applyWebViewScaleJs, webRefs],
  )

  return (
    <View style={styles.webviewWrap}>
      {tabs.map((tab) => (
        <View
          key={tab.id}
          style={[
            styles.webviewPane,
            tab.id === activeTabId ? styles.webviewPaneVisible : styles.webviewPaneHidden,
          ]}
          pointerEvents={tab.id === activeTabId ? 'auto' : 'none'}
        >
          <WebView
            key={`${tab.id}:${webViewReloadToken}`}
            source={webViewSource}
            ref={(ref) => {
              webRefs.current[tab.id] = ref
            }}
            bounces={false}
            overScrollMode="never"
            cacheEnabled={false}
            mixedContentMode="always"
            originWhitelist={['*']}
            keyboardDisplayRequiresUserAction={false}
            injectedJavaScriptBeforeContentLoaded={injectedJs}
            injectedJavaScript={injectedJs}
            onLoadEnd={() => {
              applyWebViewScale(tab.id)
              webRefs.current[tab.id]?.injectJavaScript(injectedJs)
              if (tab.id === activeTabIdRef.current) {
                setTimeout(() => focusActiveWebView(tab.id), 50)
              }
            }}
            onMessage={(event) => {
              const raw = event.nativeEvent.data
              try {
                const msg = JSON.parse(raw)
                if (msg?.type === 'clipboardRead' && typeof msg.requestId === 'string') {
                  handleClipboardRead(tab.id, msg.requestId)
                  return
                }
                if (msg?.type === 'clipboardReadText' && typeof msg.requestId === 'string') {
                  handleClipboardReadText(tab.id, msg.requestId)
                  return
                }
                if (msg?.type === 'clipboardWriteText' && typeof msg.requestId === 'string') {
                  handleClipboardWrite(
                    tab.id,
                    msg.requestId,
                    typeof msg.text === 'string' ? msg.text : '',
                    null,
                  )
                  return
                }
                if (msg?.type === 'clipboardWrite' && typeof msg.requestId === 'string') {
                  handleClipboardWrite(
                    tab.id,
                    msg.requestId,
                    typeof msg.text === 'string' ? msg.text : null,
                    typeof msg.imageDataUri === 'string' ? msg.imageDataUri : null,
                  )
                  return
                }
                if (msg?.type === 'clipboardDebug') {
                  console.log('[dash-clipboard] web:', msg.stage, msg.extra ?? '')
                  return
                }
                if (
                  msg?.type === 'googleSignIn' &&
                  typeof msg.requestId === 'string' &&
                  typeof msg.clientId === 'string'
                ) {
                  handleGoogleSignIn(tab.id, msg.requestId, msg.clientId)
                  return
                }
                if (msg?.type === 'pageTitle' && typeof msg.title === 'string') {
                  onTabTitle(tab.id, msg.title)
                  return
                }
                if (msg?.type === 'pageFavicon') {
                  const iconUrl = typeof msg.iconUrl === 'string' ? msg.iconUrl : null
                  const dataUri = typeof msg.dataUri === 'string' ? msg.dataUri : null
                  onPageFavicon?.(iconUrl, dataUri)
                  return
                }
                if (msg?.type === 'fkey' && typeof msg.n === 'number') {
                  console.log('F-key (webview):', msg.key)
                  selectOrCreateTab(msg.n)
                  return
                }
              } catch {
                // non-JSON messages from the page
              }
              console.log(raw)
            }}
            onShouldStartLoadWithRequest={() => true}
          />
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  webviewWrap: {
    flex: 1,
  },
  webviewPane: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  webviewPaneVisible: {
    opacity: 1,
    zIndex: 1,
  },
  webviewPaneHidden: {
    opacity: 0,
    zIndex: 0,
  },
})
