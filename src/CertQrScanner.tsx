import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera'
import { useBarcodeScannerOutput } from 'react-native-vision-camera-barcode-scanner'
import type { Barcode } from 'react-native-vision-camera-barcode-scanner'
import IonIcon from 'react-native-vector-icons/Ionicons'

type Props = {
  visible: boolean
  onClose: () => void
  onScanned: (value: string) => void
}

export function CertQrScanner({ visible, onClose, onScanned }: Props): React.JSX.Element {
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission()
  const backDevice = useCameraDevice('back')
  const frontDevice = useCameraDevice('front')
  const device = backDevice ?? frontDevice
  const handledRef = useRef(false)
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState)
  const [scanError, setScanError] = useState<string | null>(null)

  useEffect(() => {
    const sub = AppState.addEventListener('change', setAppState)
    return () => sub.remove()
  }, [])

  useEffect(() => {
    if (!visible) {
      handledRef.current = false
      setScanError(null)
      return
    }
    if (!hasPermission && canRequestPermission) {
      void requestPermission()
    }
  }, [visible, hasPermission, canRequestPermission, requestPermission])

  const openPermissionSettings = useCallback(async () => {
    if (canRequestPermission) {
      await requestPermission()
      return
    }
    await Linking.openSettings()
  }, [canRequestPermission, requestPermission])

  const onBarcodeScanned = useCallback(
    (barcodes: Barcode[]) => {
      if (handledRef.current) {
        return
      }
      const value = barcodes[0]?.rawValue?.trim()
      if (!value) {
        return
      }
      handledRef.current = true
      onScanned(value)
    },
    [onScanned],
  )

  const barcodeOutput = useBarcodeScannerOutput({
    barcodeFormats: ['qr-code'],
    onBarcodeScanned,
    onError: (error) => {
      console.log('[dash-cert] barcode scan error:', error)
      setScanError(error?.message ?? String(error))
    },
  })

  const isActive = visible && hasPermission && appState === 'active' && device != null

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={8} style={styles.headerBtn} accessibilityLabel="Close">
            <IonIcon name="close" size={28} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Scan certificate QR</Text>
          <View style={styles.headerBtn} />
        </View>

        {!hasPermission ? (
          <View style={styles.center}>
            <Text style={styles.message}>Camera permission is needed to scan a QR code.</Text>
            <Pressable onPress={openPermissionSettings} style={styles.button}>
              <Text style={styles.buttonText}>
                {canRequestPermission ? 'Grant permission' : 'Open Settings'}
              </Text>
            </Pressable>
          </View>
        ) : device == null ? (
          <View style={styles.center}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.message}>Looking for a camera…</Text>
          </View>
        ) : (
          <>
            <Camera
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={isActive}
              outputs={[barcodeOutput]}
              onError={(error) => {
                console.log('[dash-cert] Camera error:', error)
                setScanError(error?.message ?? String(error))
              }}
            />
            <View style={styles.hintWrap} pointerEvents="none">
              <Text style={styles.hint}>
                Point at a QR that contains the certificate (PEM or base64 DER)
              </Text>
              {scanError ? <Text style={styles.error}>{scanError}</Text> : null}
            </View>
          </>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 48,
    paddingHorizontal: 8,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  headerBtn: {
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  message: {
    color: '#ccc',
    fontSize: 15,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  hintWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 48,
    alignItems: 'center',
    gap: 8,
  },
  hint: {
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    overflow: 'hidden',
    textAlign: 'center',
    fontSize: 14,
  },
  error: {
    color: '#ff8a80',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
    textAlign: 'center',
    fontSize: 13,
  },
})
