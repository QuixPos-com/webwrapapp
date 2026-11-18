/**
 * @format
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BackHandler,
  DeviceEventEmitter,
  Modal,
  StatusBar,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { useSleepPrevention } from './sleepPrevention'
import SettingsScreen from './SettingsScreen'
import {
  DashSettings,
  buildRemoteBasicAuthHeader,
  loadDashSettings,
} from './dashSettings'
import { probeFirstReachableLocalServer } from './localServerProbe'
import { buildApplyWebViewScaleJs, getWebViewScaleForWindow } from './webViewScale'
import { buildInjectedJs } from './webViewBridges'
import { configureGoogleSignIn } from './dashGoogleSignIn'
import { TabBar } from './TabBar'
import { DashWebViews } from './DashWebViews'
import { useTabs } from './useTabs'

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark'
  const webRefs = useRef<Record<string, WebView<{}> | null>>({})
  const { width, height } = useWindowDimensions()

  const [dashUrl, setDashUrl] = useState<string | null>(null)
  const [connectionKind, setConnectionKind] = useState<'local' | 'remote' | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dashSettings, setDashSettings] = useState<DashSettings | null>(null)
  const [webViewReloadToken, setWebViewReloadToken] = useState(0)

  const {
    tabs,
    activeTabId,
    setActiveTabId,
    activeTabIdRef,
    tabDeleteMode,
    setTabDeleteMode,
    tabTitles,
    addTab,
    selectOrCreateTab,
    closeTab,
    handleTabTitle,
    toggleTabDeleteMode,
  } = useTabs(webRefs)

  const webViewScale = useMemo(
    () => getWebViewScaleForWindow(width, height),
    [width, height],
  )

  const applyWebViewScaleJs = useMemo(
    () => buildApplyWebViewScaleJs(webViewScale),
    [webViewScale],
  )

  const injectedJs = useMemo(
    () => buildInjectedJs(applyWebViewScaleJs),
    [applyWebViewScaleJs],
  )

  const applyWebViewScale = useCallback(
    (tabId?: string) => {
      const ids = tabId ? [tabId] : Object.keys(webRefs.current)
      for (const id of ids) {
        webRefs.current[id]?.injectJavaScript(applyWebViewScaleJs)
      }
    },
    [applyWebViewScaleJs],
  )

  /** Keep hardware-keyboard focus on the WebView — never on the tab chrome. */
  const focusActiveWebView = useCallback((tabId?: string) => {
    const id = tabId ?? activeTabIdRef.current
    const webView = webRefs.current[id]
    if (!webView) {
      return
    }
    // requestFocus is Android/TV; optional chaining keeps iOS quiet.
    ;(webView as WebView<{}> & { requestFocus?: () => void }).requestFocus?.()
    webView.injectJavaScript(`
      (function () {
        var el = document.activeElement;
        if (!el || el === document.body || el === document.documentElement) {
          var target = document.body || document.documentElement;
          if (target && typeof target.focus === 'function') {
            try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
          }
        }
      })();
      true;
    `)
  }, [activeTabIdRef])

  const backgroundStyle = {
    backgroundColor: isDarkMode ? '#000' : '#fff',
  }

  const handleTabPress = useCallback(
    (tabId: string) => {
      if (tabDeleteMode) {
        if (closeTab(tabId)) {
          setTabDeleteMode(false)
        }
        setTimeout(() => focusActiveWebView(), 50)
        return
      }
      setActiveTabId(tabId)
      setTimeout(() => focusActiveWebView(tabId), 50)
    },
    [tabDeleteMode, closeTab, focusActiveWebView, setActiveTabId, setTabDeleteMode],
  )

  useEffect(() => {
    applyWebViewScale()
  }, [applyWebViewScale])

  useEffect(() => {
    if (settingsOpen) {
      return
    }
    const timer = setTimeout(() => focusActiveWebView(activeTabId), 50)
    return () => clearTimeout(timer)
  }, [activeTabId, settingsOpen, focusActiveWebView])

  useEffect(() => {
    let cancelled = false
    loadDashSettings().then((settings) => {
      if (!cancelled) {
        setDashSettings(settings)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // webClientId is applied when the page requests sign-in (same WEB OAuth client as GIS).
    configureGoogleSignIn()
  }, [])

  useEffect(() => {
    if (!dashSettings) {
      return
    }
    let cancelled = false
    // Do not clear dashUrl while probing — that unmounts every WebView and looks like a refresh.
    probeFirstReachableLocalServer(dashSettings.localUrls).then((localUrl) => {
      if (cancelled) {
        return
      }
      if (localUrl) {
        console.log('dashboard url (local):', localUrl)
        setConnectionKind('local')
        setDashUrl((prev) => (prev === localUrl ? prev : localUrl))
        return
      }
      console.log('dashboard url (remote):', dashSettings.remoteUrl)
      setConnectionKind('remote')
      setDashUrl((prev) =>
        prev === dashSettings.remoteUrl ? prev : dashSettings.remoteUrl,
      )
    })
    return () => {
      cancelled = true
    }
  }, [dashSettings])

  const webViewSource = useMemo(() => {
    if (!dashUrl) {
      return null
    }
    if (connectionKind === 'remote' && dashSettings) {
      const auth = buildRemoteBasicAuthHeader(dashSettings)
      if (auth) {
        return { uri: dashUrl, headers: { Authorization: auth } }
      }
    }
    return { uri: dashUrl }
  }, [dashUrl, connectionKind, dashSettings])

  const handleSettingsSaved = useCallback((settings: DashSettings) => {
    setDashSettings(settings)
    // Force WebView remount even when the resolved URL is unchanged.
    setWebViewReloadToken((n) => n + 1)
  }, [])

  const handleLocalCertChanged = useCallback(() => {
    setWebViewReloadToken((n) => n + 1)
  }, [])

  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
    setTimeout(() => focusActiveWebView(), 100)
  }, [focusActiveWebView])

  useSleepPrevention()

  useEffect(() => {
    const injectKey = (
      type: 'keydown' | 'keyup',
      key: string,
      code: string,
      keyCode: number,
    ) => {
      const activeId = activeTabIdRef.current
      const keyJson = JSON.stringify(key)
      const codeJson = JSON.stringify(code)
      webRefs.current[activeId]?.injectJavaScript(`
        (function () {
          var target = document.activeElement || document.body || document;
          var opts = {
            key: ${keyJson},
            code: ${codeJson},
            keyCode: ${keyCode},
            which: ${keyCode},
            bubbles: true,
            cancelable: true,
          };
          target.dispatchEvent(new KeyboardEvent('${type}', opts));
          window.dispatchEvent(new KeyboardEvent('${type}', opts));
          document.dispatchEvent(new KeyboardEvent('${type}', opts));
        })();
        true;
      `)
    }

    const injectEscape = (type: 'keydown' | 'keyup' = 'keydown') => {
      injectKey(type, 'Escape', 'Escape', 27)
    }

    const ARROW_KEYS: Record<string, { code: string; keyCode: number }> = {
      ArrowUp: { code: 'ArrowUp', keyCode: 38 },
      ArrowDown: { code: 'ArrowDown', keyCode: 40 },
      ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
      ArrowRight: { code: 'ArrowRight', keyCode: 39 },
    }

    // Emulator maps Esc -> Android Back, so handle Back as Escape for the WebView.
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (settingsOpen) {
        closeSettings()
        return true
      }
      injectEscape('keydown')
      injectEscape('keyup')
      return true
    })

    const keySub = DeviceEventEmitter.addListener('hardwareKey', (event) => {
      const type = event?.type === 'keyup' ? 'keyup' : 'keydown'
      const key = typeof event?.key === 'string' ? event.key : ''

      const fMatch = /^F(\d{1,2})$/.exec(key)
      if (fMatch) {
        if (type === 'keydown') {
          console.log('F-key (native):', key)
          selectOrCreateTab(Number(fMatch[1]))
        }
        return
      }

      const arrow = ARROW_KEYS[key]
      if (arrow) {
        injectKey(type, key, arrow.code, arrow.keyCode)
        return
      }

      if (key === 'Escape' || event?.keyCode === 27) {
        injectEscape(type)
      }
    })

    return () => {
      backSub.remove()
      keySub.remove()
    }
  }, [selectOrCreateTab, settingsOpen, closeSettings, activeTabIdRef])

  return (
    <SafeAreaView style={[styles.container, backgroundStyle]} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={backgroundStyle.backgroundColor}
        translucent={false}
      />
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        tabTitles={tabTitles}
        tabDeleteMode={tabDeleteMode}
        isDarkMode={isDarkMode}
        onTabPress={handleTabPress}
        onAddTab={addTab}
        onToggleTabDeleteMode={toggleTabDeleteMode}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {webViewSource ? (
        <DashWebViews
          tabs={tabs}
          activeTabId={activeTabId}
          webViewSource={webViewSource}
          webViewReloadToken={webViewReloadToken}
          injectedJs={injectedJs}
          applyWebViewScaleJs={applyWebViewScaleJs}
          webRefs={webRefs}
          activeTabIdRef={activeTabIdRef}
          focusActiveWebView={focusActiveWebView}
          selectOrCreateTab={selectOrCreateTab}
          onTabTitle={handleTabTitle}
        />
      ) : null}
      <Modal
        visible={settingsOpen}
        animationType="none"
        presentationStyle="fullScreen"
        onRequestClose={closeSettings}
      >
        <SafeAreaView
          style={[styles.container, backgroundStyle]}
          edges={['top', 'right', 'bottom', 'left']}
        >
          <StatusBar
            barStyle={isDarkMode ? 'light-content' : 'dark-content'}
            backgroundColor={backgroundStyle.backgroundColor}
            translucent={false}
          />
          <SettingsScreen
            onClose={closeSettings}
            onSaved={handleSettingsSaved}
            onLocalCertChanged={handleLocalCertChanged}
            activeConnectionUrl={dashUrl}
            activeConnectionKind={connectionKind}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
})

export default App
