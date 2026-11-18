import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { WebView } from 'react-native-webview'
import type { Tab } from './tabs'
import { isUrlLikeTitle } from './webViewBridges'

export function useTabs(webRefs: React.MutableRefObject<Record<string, WebView<{}> | null>>) {
  const nextTabIdRef = useRef(2)
  const activeTabIdRef = useRef<string>('1')
  const tabsRef = useRef<Tab[]>([{ id: '1' }])

  const [tabs, setTabs] = useState<Tab[]>([{ id: '1' }])
  const [activeTabId, setActiveTabId] = useState('1')
  const [tabDeleteMode, setTabDeleteMode] = useState(false)
  const [tabTitles, setTabTitles] = useState<Record<string, string>>({})

  activeTabIdRef.current = activeTabId
  tabsRef.current = tabs

  const createTab = useCallback((): Tab => {
    const id = String(nextTabIdRef.current++)
    return { id }
  }, [])

  // Fast refresh resets module state but keeps tab list — keep ids unique.
  useEffect(() => {
    const seen = new Set<string>()
    let hasDupes = false
    const deduped = tabs.filter((tab) => {
      if (seen.has(tab.id)) {
        hasDupes = true
        return false
      }
      seen.add(tab.id)
      return true
    })

    if (hasDupes) {
      tabsRef.current = deduped
      setTabs(deduped)
      if (!deduped.some((tab) => tab.id === activeTabIdRef.current)) {
        setActiveTabId(deduped[deduped.length - 1]?.id ?? '1')
      }
    }

    let maxNumericId = 1
    for (const tab of deduped) {
      const n = Number(tab.id)
      if (Number.isFinite(n)) {
        maxNumericId = Math.max(maxNumericId, n)
      }
    }
    if (nextTabIdRef.current <= maxNumericId) {
      nextTabIdRef.current = maxNumericId + 1
    }
  }, [tabs])

  const addTab = useCallback(() => {
    const tab = createTab()
    const next = [...tabsRef.current, tab]
    tabsRef.current = next
    setTabs(next)
    setActiveTabId(tab.id)
  }, [createTab])

  /** Ensure at least `count` tabs exist, then switch to the tab at that 1-based index. */
  const selectOrCreateTab = useCallback((count: number) => {
    const targetCount = Math.max(1, Math.min(12, count))
    let next = tabsRef.current
    if (next.length < targetCount) {
      next = [...next]
      while (next.length < targetCount) {
        next.push(createTab())
      }
      tabsRef.current = next
      setTabs(next)
    }
    const targetId = next[targetCount - 1].id
    if (activeTabIdRef.current !== targetId) {
      setActiveTabId(targetId)
    }
  }, [createTab])

  const closeTab = useCallback((tabId: string) => {
    const prev = tabsRef.current
    if (prev.length <= 1) {
      return false
    }
    const next = prev.filter((t) => t.id !== tabId)
    delete webRefs.current[tabId]
    tabsRef.current = next
    setTabs(next)
    setTabTitles((titles) => {
      if (!(tabId in titles)) {
        return titles
      }
      const { [tabId]: _removed, ...rest } = titles
      return rest
    })
    if (activeTabIdRef.current === tabId) {
      const closedIndex = prev.findIndex((t) => t.id === tabId)
      const fallback = next[Math.max(0, closedIndex - 1)] ?? next[0]
      setActiveTabId(fallback.id)
    }
    return true
  }, [webRefs])

  const handleTabTitle = useCallback((tabId: string, title: string | undefined) => {
    const nextTitle = typeof title === 'string' ? title.trim() : ''
    if (!nextTitle || isUrlLikeTitle(nextTitle)) {
      return
    }
    setTabTitles((prev) => (prev[tabId] === nextTitle ? prev : { ...prev, [tabId]: nextTitle }))
  }, [])

  const clearTabTitles = useCallback(() => {
    setTabTitles({})
  }, [])

  const toggleTabDeleteMode = useCallback(() => {
    setTabDeleteMode((on) => {
      if (on) {
        return false
      }
      return tabsRef.current.length > 1
    })
  }, [])

  useEffect(() => {
    if (tabs.length <= 1 && tabDeleteMode) {
      setTabDeleteMode(false)
    }
  }, [tabs.length, tabDeleteMode])

  return {
    tabs,
    activeTabId,
    setActiveTabId,
    activeTabIdRef,
    tabsRef,
    tabDeleteMode,
    setTabDeleteMode,
    tabTitles,
    addTab,
    selectOrCreateTab,
    closeTab,
    handleTabTitle,
    clearTabTitles,
    toggleTabDeleteMode,
  }
}
