import AsyncStorage from '@react-native-async-storage/async-storage'

export const DEFAULT_REMOTE_DASH_URL = ''
export const DEFAULT_LOCAL_SERVER_CANDIDATES = [] as const

const STORAGE_KEY = 'dash.dashSettings.v1'

export type DashSettings = {
  remoteUrl: string
  remoteUsername: string
  remotePassword: string
  localUrls: string[]
}

export function getDefaultDashSettings(): DashSettings {
  return {
    remoteUrl: DEFAULT_REMOTE_DASH_URL,
    remoteUsername: '',
    remotePassword: '',
    localUrls: [...DEFAULT_LOCAL_SERVER_CANDIDATES],
  }
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Drop legacy dashboard `?b` query if still present in stored settings. */
function stripLegacyDashQuery(url: string): string {
  return url.replace(/\/?\?b$/i, '').replace(/\/$/, '')
}

function normalizeUrlList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => stripLegacyDashQuery(item.trim()))
    .filter((item) => item.length > 0)
}

export function sanitizeDashSettings(raw: Partial<DashSettings> | null | undefined): DashSettings {
  const defaults = getDefaultDashSettings()
  const remoteUrl =
    typeof raw?.remoteUrl === 'string' && raw.remoteUrl.trim().length > 0
      ? stripLegacyDashQuery(raw.remoteUrl.trim())
      : defaults.remoteUrl
  const localUrls = normalizeUrlList(raw?.localUrls)
  return {
    remoteUrl: remoteUrl || defaults.remoteUrl,
    remoteUsername: asTrimmedString(raw?.remoteUsername),
    remotePassword: typeof raw?.remotePassword === 'string' ? raw.remotePassword : '',
    localUrls: localUrls.length > 0 ? localUrls : defaults.localUrls,
  }
}

export async function loadDashSettings(): Promise<DashSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return getDefaultDashSettings()
    }
    return sanitizeDashSettings(JSON.parse(raw) as Partial<DashSettings>)
  } catch (error) {
    console.log('dashSettings load failed:', error)
    return getDefaultDashSettings()
  }
}

export async function saveDashSettings(settings: DashSettings): Promise<DashSettings> {
  const next = sanitizeDashSettings(settings)
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export async function resetDashSettings(): Promise<DashSettings> {
  const defaults = getDefaultDashSettings()
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
  return defaults
}

/** Latin-1 Base64 for HTTP Basic Auth (credentials are typically ASCII). */
function encodeBasicAuthToken(username: string, password: string): string {
  const input = `${username}:${password}`
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(input)
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let output = ''
  let i = 0
  while (i < input.length) {
    const a = input.charCodeAt(i++) & 0xff
    const b = i < input.length ? input.charCodeAt(i++) & 0xff : NaN
    const c = i < input.length ? input.charCodeAt(i++) & 0xff : NaN
    const bitmap = (a << 16) | ((Number.isNaN(b) ? 0 : b) << 8) | (Number.isNaN(c) ? 0 : c)
    output += chars.charAt((bitmap >> 18) & 63)
    output += chars.charAt((bitmap >> 12) & 63)
    output += Number.isNaN(b) ? '=' : chars.charAt((bitmap >> 6) & 63)
    output += Number.isNaN(c) ? '=' : chars.charAt(bitmap & 63)
  }
  return output
}

export function buildRemoteBasicAuthHeader(settings: DashSettings): string | null {
  if (!settings.remoteUsername && !settings.remotePassword) {
    return null
  }
  return `Basic ${encodeBasicAuthToken(settings.remoteUsername, settings.remotePassword)}`
}
