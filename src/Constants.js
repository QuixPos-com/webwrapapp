import { Dimensions, Platform, StatusBar } from 'react-native'

export const CONTENT_SPACING = 15

const statusBarHeight = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0

export const SAFE_AREA_PADDING = {
  paddingLeft: CONTENT_SPACING,
  paddingTop: statusBarHeight + CONTENT_SPACING,
  paddingRight: CONTENT_SPACING,
  paddingBottom: CONTENT_SPACING,
}

export const SCREEN_WIDTH = Dimensions.get('window').width
export const SCREEN_HEIGHT = Dimensions.get('window').height

export const CONTROL_BUTTON_SIZE = 40
