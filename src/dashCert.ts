import { NativeModules } from 'react-native'

type DashCertStatus = {
  installed: boolean
  path?: string
}

type DashCertNative = {
  pickAndSave: () => Promise<DashCertStatus>
  saveFromPayload: (payload: string) => Promise<DashCertStatus>
  getStatus: () => Promise<DashCertStatus>
  clear: () => Promise<DashCertStatus>
}

const native = NativeModules.DashCert as DashCertNative | undefined

function requireNative(): DashCertNative {
  if (!native) {
    throw new Error('DashCert native module is not available')
  }
  return native
}

export async function getLocalCertStatus(): Promise<DashCertStatus> {
  return requireNative().getStatus()
}

export async function pickAndSaveLocalCert(): Promise<DashCertStatus> {
  return requireNative().pickAndSave()
}

/** Save PEM/DER text, base64, or download from an http(s) URL (e.g. from a QR code). */
export async function saveLocalCertFromPayload(payload: string): Promise<DashCertStatus> {
  return requireNative().saveFromPayload(payload)
}

export async function clearLocalCert(): Promise<DashCertStatus> {
  return requireNative().clear()
}
