import { NativeModules, Platform } from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'

export type ClipboardContent = {
  imageDataUri: string | null
  text: string | null
  html: string | null
}

type DashClipboardNative = {
  getImageDataUri: () => Promise<string | null>
  getClipboardContent: () => Promise<ClipboardContent>
  getText: () => Promise<string>
  setText: (text: string) => Promise<boolean>
  setImageDataUri: (dataUri: string) => Promise<boolean>
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

/** Read image, plain text, and HTML from the system clipboard. */
export async function readClipboardContent(): Promise<ClipboardContent> {
  if (Platform.OS === 'android' && nativeModule?.getClipboardContent) {
    try {
      const content = await nativeModule.getClipboardContent()
      if (content && (content.imageDataUri || content.text || content.html)) {
        return {
          imageDataUri: content.imageDataUri ?? null,
          text: content.text ?? null,
          html: content.html ?? null,
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(`${LOG_PREFIX} getClipboardContent failed:`, message)
    }
  }

  let imageDataUri: string | null = null
  let text: string | null = null

  try {
    imageDataUri = await readClipboardImageDataUri()
  } catch {
    // ignore
  }

  try {
    const fallbackText = await Clipboard.getString()
    if (fallbackText) {
      text = fallbackText
    }
  } catch {
    // ignore
  }

  return {
    imageDataUri,
    text,
    html: null,
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

/** Read plain text from the system clipboard. */
export async function readClipboardText(): Promise<string> {
  if (Platform.OS === 'android' && nativeModule?.getText) {
    try {
      const text = await nativeModule.getText()
      if (typeof text === 'string' && text.length > 0) {
        return text
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(`${LOG_PREFIX} native getText failed:`, message)
    }
  }

  try {
    return (await Clipboard.getString()) ?? ''
  } catch {
    return ''
  }
}

/** Write plain text to the system clipboard. */
export async function writeClipboardText(text: string): Promise<void> {
  if (Platform.OS === 'android' && nativeModule?.setText) {
    try {
      await nativeModule.setText(text)
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(`${LOG_PREFIX} native setText failed:`, message)
    }
  }
  Clipboard.setString(text)
}

/** Cache an image data URI written by the page onto the native clipboard bridge. */
export async function writeClipboardImageDataUri(dataUri: string): Promise<void> {
  if (Platform.OS === 'android' && nativeModule?.setImageDataUri) {
    try {
      await nativeModule.setImageDataUri(dataUri)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(`${LOG_PREFIX} native setImageDataUri failed:`, message)
    }
  }
}
