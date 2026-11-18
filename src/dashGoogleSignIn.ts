import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin'

export class GoogleSignInCancelledError extends Error {
  constructor() {
    super('Sign-in was cancelled')
    this.name = 'GoogleSignInCancelledError'
  }
}

let configuredClientId: string | null = null

/** Call once at app start; also safe to call again when the web page passes its client ID. */
export function configureGoogleSignIn(webClientId?: string): void {
  const next = typeof webClientId === 'string' ? webClientId.trim() : ''
  if (next && next === configuredClientId) {
    return
  }
  GoogleSignin.configure(next ? { webClientId: next } : {})
  configuredClientId = next || null
}

/** Native Google sign-in; returns a JWT idToken (same audience as GIS when webClientId matches). */
export async function requestNativeGoogleIdToken(webClientId: string): Promise<string> {
  if (!webClientId?.trim()) {
    throw new Error('Google client ID is not configured')
  }

  configureGoogleSignIn(webClientId.trim())

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })

  // Clear the last account so the picker shows again after a rejected / wrong email.
  try {
    await GoogleSignin.signOut()
  } catch {
    // ignore — no previous session
  }

  const response = await GoogleSignin.signIn()

  if (isCancelledResponse(response)) {
    throw new GoogleSignInCancelledError()
  }

  if (!isSuccessResponse(response)) {
    throw new GoogleSignInCancelledError()
  }

  const idToken = response.data.idToken
  if (!idToken) {
    throw new Error(
      'Google sign-in succeeded but no idToken was returned. Check that webClientId is a WEB OAuth client ID.',
    )
  }

  return idToken
}

export function formatGoogleSignInError(error: unknown): {
  code: 'cancelled' | 'error'
  message: string
} {
  if (error instanceof GoogleSignInCancelledError) {
    return { code: 'cancelled', message: error.message }
  }
  if (isErrorWithCode(error)) {
    if (error.code === statusCodes.SIGN_IN_CANCELLED) {
      return { code: 'cancelled', message: 'Sign-in was cancelled' }
    }
    if (error.code === statusCodes.IN_PROGRESS) {
      return { code: 'error', message: 'Google sign-in already in progress' }
    }
    if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return { code: 'error', message: 'Google Play Services is not available or outdated' }
    }
    return { code: 'error', message: error.message || String(error.code) }
  }
  if (error instanceof Error) {
    return { code: 'error', message: error.message }
  }
  return { code: 'error', message: String(error) }
}
