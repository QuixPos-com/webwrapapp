import { useEffect } from 'react'
import IdleTimerManager from 'react-native-idle-timer'

const DEFAULT_TAG = 'dash'

/** Keep the screen awake while the app is in use. */
export function enableSleepPrevention(tag = DEFAULT_TAG): void {
  IdleTimerManager.setIdleTimerDisabled(true, tag)
}

/** Allow the device to sleep again for this tag. */
export function disableSleepPrevention(tag = DEFAULT_TAG): void {
  IdleTimerManager.setIdleTimerDisabled(false, tag)
}

/** Enable sleep prevention for the lifetime of the calling component. */
export function useSleepPrevention(tag = DEFAULT_TAG): void {
  useEffect(() => {
    enableSleepPrevention(tag)
    return () => disableSleepPrevention(tag)
  }, [tag])
}
