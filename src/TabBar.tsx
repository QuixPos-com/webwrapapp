import React from 'react'
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import IonIcon from 'react-native-vector-icons/Ionicons'
import type { Tab } from './tabs'
import { DEFAULT_APP_NAME } from './dashAppIdentity'

const TAB_DELETE_GREY = '#9e9e9e'
const TAB_DELETE_BLUE = '#2196F3'
const TAB_DELETE_TAB_BG = '#ffcdd2'
const TAB_DELETE_TAB_BG_ACTIVE = '#ef9a9a'
const TAB_DELETE_TAB_TEXT = '#b71c1c'
/** F-tab hit target width (~3× the original compact label tabs). */
const TAB_HANDLE_MIN_WIDTH = 120

type TabBarProps = {
  tabs: Tab[]
  activeTabId: string
  tabTitles: Record<string, string>
  tabDeleteMode: boolean
  isDarkMode: boolean
  appName?: string
  appIconUri?: string | null
  onTabPress: (tabId: string) => void
  onAddTab: () => void
  onToggleTabDeleteMode: () => void
  onOpenSettings: () => void
}

export function TabBar({
  tabs,
  activeTabId,
  tabTitles,
  tabDeleteMode,
  isDarkMode,
  appName,
  appIconUri,
  onTabPress,
  onAddTab,
  onToggleTabDeleteMode,
  onOpenSettings,
}: TabBarProps): React.JSX.Element {
  const tabBarStyle = {
    backgroundColor: isDarkMode ? '#111' : '#f2f2f2',
    borderBottomColor: isDarkMode ? '#333' : '#ddd',
  }

  const tabTextColor = isDarkMode ? '#aaa' : '#666'
  const activeTabTextColor = isDarkMode ? '#fff' : '#111'
  const activeTabBg = isDarkMode ? '#3a3a3a' : '#fff'
  const activeTabBorder = isDarkMode ? '#5a5a5a' : '#c8c8c8'
  const tabDeleteBg = isDarkMode ? '#5c2b2b' : TAB_DELETE_TAB_BG
  const tabDeleteActiveBg = isDarkMode ? '#8b3a3a' : TAB_DELETE_TAB_BG_ACTIVE
  const tabDeleteTextColor = isDarkMode ? '#ffcdd2' : TAB_DELETE_TAB_TEXT
  const canToggleTabDelete = tabs.length > 1 || tabDeleteMode

  const fallbackSiteName =
    appName && appName.trim() && appName.trim() !== DEFAULT_APP_NAME ? appName.trim() : undefined

  return (
    <View style={[styles.tabBar, tabBarStyle]} focusable={false}>
      {appIconUri ? (
        <View style={styles.appBadge} focusable={false}>
          <Image source={{ uri: appIconUri }} style={styles.appIcon} />
        </View>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBarScroll}
        contentContainerStyle={styles.tabBarContent}
        focusable={false}
        keyboardShouldPersistTaps="handled"
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId
          const pageTitle = tabTitles[tab.id] ?? fallbackSiteName
          const fLabel = `F${index + 1}`
          const titleColor = tabDeleteMode
            ? tabDeleteTextColor
            : isActive
              ? activeTabTextColor
              : tabTextColor
          return (
            <View
              key={tab.id}
              focusable={false}
              style={[
                styles.tab,
                tabDeleteMode
                  ? {
                      backgroundColor: isActive ? tabDeleteActiveBg : tabDeleteBg,
                    }
                  : {
                      backgroundColor: isActive ? activeTabBg : 'transparent',
                      borderColor: isActive ? activeTabBorder : 'transparent',
                    },
                isActive && !tabDeleteMode ? styles.tabActive : null,
              ]}
            >
              <Pressable
                onPress={() => onTabPress(tab.id)}
                style={styles.tabHit}
                hitSlop={4}
                focusable={false}
              >
                <View
                  style={[
                    styles.fkeyCap,
                    isActive && !tabDeleteMode ? styles.fkeyCapActive : null,
                    tabDeleteMode ? styles.fkeyCapDelete : null,
                  ]}
                >
                  <Text style={styles.fkeyCapLabel}>{fLabel}</Text>
                </View>
                {pageTitle ? (
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={[
                      styles.tabLabel,
                      { color: titleColor },
                      isActive && !tabDeleteMode ? styles.tabLabelActive : null,
                    ]}
                  >
                    {pageTitle}
                  </Text>
                ) : null}
              </Pressable>
            </View>
          )
        })}
        <Pressable
          onPress={onAddTab}
          style={styles.addTab}
          hitSlop={8}
          focusable={false}
        >
          <Text style={[styles.addTabLabel, { color: activeTabTextColor }]}>+</Text>
        </Pressable>
      </ScrollView>
      <Pressable
        onPress={onToggleTabDeleteMode}
        disabled={!canToggleTabDelete}
        style={[styles.trashTab, !canToggleTabDelete && styles.trashTabDisabled]}
        hitSlop={8}
        focusable={false}
        accessibilityLabel={tabDeleteMode ? 'Cancel close tab' : 'Close a tab'}
        accessibilityState={{ disabled: !canToggleTabDelete }}
      >
        <IonIcon
          name="trash-outline"
          size={22}
          color={tabDeleteMode ? TAB_DELETE_BLUE : TAB_DELETE_GREY}
        />
      </Pressable>
      <Pressable
        onPress={onOpenSettings}
        style={styles.trashTab}
        hitSlop={8}
        focusable={false}
        accessibilityLabel="Settings"
      >
        <IonIcon name="settings-outline" size={22} color={TAB_DELETE_GREY} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 40,
  },
  appBadge: {
    paddingLeft: 10,
    paddingRight: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIcon: {
    width: 22,
    height: 22,
    borderRadius: 4,
  },
  tabBarScroll: {
    flex: 1,
  },
  tabBarContent: {
    alignItems: 'center',
    paddingHorizontal: 4,
    gap: 4,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minWidth: TAB_HANDLE_MIN_WIDTH,
    maxWidth: 240,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabActive: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
  },
  tabHit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    paddingVertical: 2,
    maxWidth: '100%',
  },
  fkeyCap: {
    minWidth: 28,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#2c2c2c',
    borderWidth: 1,
    borderColor: '#111',
    borderBottomWidth: 2,
    borderBottomColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.72,
  },
  fkeyCapActive: {
    backgroundColor: '#1565C0',
    borderColor: '#0d47a1',
    borderBottomColor: '#0a3a7a',
    opacity: 1,
  },
  fkeyCapDelete: {
    backgroundColor: '#b71c1c',
    borderColor: '#7f0000',
    borderBottomColor: '#4a0000',
    opacity: 1,
  },
  fkeyCapLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
  },
  tabLabel: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'left',
  },
  tabLabelActive: {
    fontWeight: '700',
  },

  trashTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trashTabDisabled: {
    opacity: 0.45,
  },
  addTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addTabLabel: {
    fontSize: 22,
    fontWeight: '400',
    lineHeight: 24,
  },
})
