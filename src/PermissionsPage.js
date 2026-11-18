import React, { useCallback, useEffect, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { Camera } from 'react-native-vision-camera'

export function PermissionsPage({ onPermissionGranted }) {
  const [cameraPermissionStatus, setCameraPermissionStatus] = useState(
    Camera.getCameraPermissionStatus(),
  )

  const requestCameraPermission = useCallback(async () => {
    const permission = await Camera.requestCameraPermission()
    setCameraPermissionStatus(permission)
    if (permission === 'denied') {
      await Linking.openSettings()
    }
  }, [])

  useEffect(() => {
    if (cameraPermissionStatus === 'granted') {
      onPermissionGranted?.()
    } else if (cameraPermissionStatus === 'not-determined') {
      requestCameraPermission()
    }
  }, [cameraPermissionStatus, onPermissionGranted, requestCameraPermission])

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Camera permission needed</Text>
      <Text style={styles.message}>
        This app needs camera access to scan barcodes.
      </Text>
      {cameraPermissionStatus !== 'granted' && (
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={requestCameraPermission}>
          <Text style={styles.buttonText}>
            {cameraPermissionStatus === 'denied' ? 'Open Settings' : 'Grant Permission'}
          </Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    color: 'white',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    color: '#ccc',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#2e7d32',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonPressed: {
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
})
