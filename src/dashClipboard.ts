import { NativeModules, Platform } from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'

type DashClipboardNative = {
  getImageDataUri: () => Promise<string | null>
  describeClipboard: () => Promise<string>
}

const nativeModule = NativeModules.DashClipboard as DashClipboardNative | undefined

const LOG_PREFIX = '[dash-clipboard]'

async function describeClipboardForDebug(): Promise<void> {
  if (Platform.OS !== 'android' || !nativeModule?.describeClipboard) {
    return
  }
  try {
    const description = await nativeModule.describeClipboard()
    console.log(`${LOG_PREFIX} describe:`, description)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`${LOG_PREFIX} describe failed:`, message)
  }
}

/** Read an image from the system clipboard as a data URI, if present. */
export async function readClipboardImageDataUri(): Promise<string | null> {
  if (Platform.OS === 'android' && nativeModule?.getImageDataUri) {
    try {
      const dataUri = await nativeModule.getImageDataUri()
      if (dataUri) {
        console.log(
          `${LOG_PREFIX} image: len=${dataUri.length} prefix=${dataUri.slice(0, 48)}`,
        )
        return dataUri
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(`${LOG_PREFIX} native read failed:`, message)
    }
  }

  try {
    const fallback = await Clipboard.getImage()
    if (fallback) {
      console.log(
        `${LOG_PREFIX} fallback image: len=${fallback.length} prefix=${fallback.slice(0, 48)}`,
      )
      return fallback
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`${LOG_PREFIX} fallback read failed:`, message)
  }

  await describeClipboardForDebug()
  return null
}
