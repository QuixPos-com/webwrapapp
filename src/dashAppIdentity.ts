import { NativeModules, Platform } from 'react-native'

export const DEFAULT_APP_NAME = 'WebWrap'

export type AppIdentityStatus = {
  siteUrl: string
  appName: string
  iconDataUri: string | null
}

type UpdateBrandingOptions = {
  siteUrl?: string | null
  title?: string | null
  iconDataUri?: string | null
  iconUrl?: string | null
  authHeader?: string | null
}

type DashAppIdentityNative = {
  getStatus: () => Promise<AppIdentityStatus>
  syncWebsite: (siteUrl: string, authHeader: string | null) => Promise<AppIdentityStatus>
  updateBranding: (options: UpdateBrandingOptions) => Promise<AppIdentityStatus>
  clear: () => Promise<AppIdentityStatus>
  requestPinShortcut: () => Promise<boolean>
}

const native = NativeModules.DashAppIdentity as DashAppIdentityNative | undefined

let fallbackStatus: AppIdentityStatus = {
  siteUrl: '',
  appName: DEFAULT_APP_NAME,
  iconDataUri: null,
}

export async function getAppIdentityStatus(): Promise<AppIdentityStatus> {
  if (Platform.OS === 'android' && native?.getStatus) {
    try {
      return await native.getStatus()
    } catch (error) {
      console.log('[dash-identity] getStatus failed:', error)
    }
  }
  return fallbackStatus
}

export async function syncWebsiteIdentity(
  siteUrl: string,
  authHeader?: string | null,
): Promise<AppIdentityStatus> {
  const trimmed = siteUrl.trim()
  if (!trimmed) {
    return clearAppIdentity()
  }
  if (Platform.OS === 'android' && native?.syncWebsite) {
    try {
      const next = await native.syncWebsite(trimmed, authHeader ?? null)
      fallbackStatus = next
      return next
    } catch (error) {
      console.log('[dash-identity] syncWebsite failed:', error)
    }
  }
  fallbackStatus = {
    ...fallbackStatus,
    siteUrl: trimmed,
  }
  return fallbackStatus
}

export async function updateAppBranding(
  options: UpdateBrandingOptions,
): Promise<AppIdentityStatus> {
  if (Platform.OS === 'android' && native?.updateBranding) {
    try {
      const next = await native.updateBranding(options)
      fallbackStatus = next
      return next
    } catch (error) {
      console.log('[dash-identity] updateBranding failed:', error)
    }
  }
  fallbackStatus = {
    siteUrl: options.siteUrl?.trim() || fallbackStatus.siteUrl,
    appName: options.title?.trim() || fallbackStatus.appName || DEFAULT_APP_NAME,
    iconDataUri: options.iconDataUri || fallbackStatus.iconDataUri,
  }
  return fallbackStatus
}

export async function clearAppIdentity(): Promise<AppIdentityStatus> {
  if (Platform.OS === 'android' && native?.clear) {
    try {
      const next = await native.clear()
      fallbackStatus = next
      return next
    } catch (error) {
      console.log('[dash-identity] clear failed:', error)
    }
  }
  fallbackStatus = {
    siteUrl: '',
    appName: DEFAULT_APP_NAME,
    iconDataUri: null,
  }
  return fallbackStatus
}

export async function requestPinWebsiteShortcut(): Promise<boolean> {
  if (Platform.OS === 'android' && native?.requestPinShortcut) {
    try {
      return await native.requestPinShortcut()
    } catch (error) {
      console.log('[dash-identity] requestPinShortcut failed:', error)
    }
  }
  return false
}
