/**
 * @format
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native'
import IonIcon from 'react-native-vector-icons/Ionicons'
import {
  DashSettings,
  getDefaultDashSettings,
  loadDashSettings,
  resetDashSettings,
  saveDashSettings,
} from './dashSettings'
import {
  clearLocalCert,
  getLocalCertStatus,
  pickAndSaveLocalCert,
  saveLocalCertFromPayload,
} from './dashCert'
import { CertQrScanner } from './CertQrScanner'

type Props = {
  onClose: () => void
  onSaved: (settings: DashSettings) => void
  /** Remount WebViews after the local HTTPS cert is added or removed. */
  onLocalCertChanged?: () => void
  /** Currently loaded dashboard URL (after local probe / remote fallback). */
  activeConnectionUrl: string | null
  activeConnectionKind: 'local' | 'remote' | null
}

export default function SettingsScreen({
  onClose,
  onSaved,
  onLocalCertChanged,
  activeConnectionUrl,
  activeConnectionKind,
}: Props): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [remoteUrl, setRemoteUrl] = useState('')
  const [remoteUsername, setRemoteUsername] = useState('')
  const [remotePassword, setRemotePassword] = useState('')
  const [localUrls, setLocalUrls] = useState<string[]>([''])
  const [certInstalled, setCertInstalled] = useState(false)
  const [certBusy, setCertBusy] = useState(false)
  const [certQrOpen, setCertQrOpen] = useState(false)

  const backgroundColor = isDarkMode ? '#121212' : '#f5f5f5'
  const cardColor = isDarkMode ? '#1e1e1e' : '#ffffff'
  const textColor = isDarkMode ? '#eee' : '#222'
  const mutedColor = isDarkMode ? '#aaa' : '#666'
  const borderColor = isDarkMode ? '#333' : '#ddd'
  const inputBg = isDarkMode ? '#2a2a2a' : '#fff'

  useEffect(() => {
    let cancelled = false
    Promise.all([loadDashSettings(), getLocalCertStatus().catch(() => ({ installed: false }))]).then(
      ([settings, cert]) => {
        if (cancelled) {
          return
        }
        setRemoteUrl(settings.remoteUrl)
        setRemoteUsername(settings.remoteUsername)
        setRemotePassword(settings.remotePassword)
        setLocalUrls(settings.localUrls.length > 0 ? settings.localUrls : [''])
        setCertInstalled(!!cert.installed)
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  const updateLocalUrl = useCallback((index: number, value: string) => {
    setLocalUrls((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }, [])

  const addLocalUrl = useCallback(() => {
    setLocalUrls((prev) => [...prev, ''])
  }, [])

  const removeLocalUrl = useCallback((index: number) => {
    setLocalUrls((prev) => {
      if (prev.length <= 1) {
        return ['']
      }
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  const handleSave = useCallback(async () => {
    const trimmedRemote = remoteUrl.trim()
    if (!trimmedRemote) {
      Alert.alert('Settings', 'Online URL cannot be empty.')
      return
    }
    const cleanedLocal = localUrls.map((u) => u.trim()).filter((u) => u.length > 0)
    setSaving(true)
    try {
      const saved = await saveDashSettings({
        remoteUrl: trimmedRemote,
        remoteUsername: remoteUsername.trim(),
        remotePassword,
        localUrls: cleanedLocal,
      })
      onSaved(saved)
      Alert.alert('Settings', 'Saved. Dashboard will reload with the new URLs.')
      onClose()
    } catch (error) {
      console.log('dashSettings save failed:', error)
      Alert.alert('Settings', 'Could not save settings.')
    } finally {
      setSaving(false)
    }
  }, [remoteUrl, remoteUsername, remotePassword, localUrls, onSaved, onClose])

  const handleReset = useCallback(() => {
    Alert.alert(
      'Reset settings',
      'Restore the built-in online URL, credentials, and local URL list?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setSaving(true)
              try {
                const defaults = await resetDashSettings()
                setRemoteUrl(defaults.remoteUrl)
                setRemoteUsername(defaults.remoteUsername)
                setRemotePassword(defaults.remotePassword)
                setLocalUrls(defaults.localUrls)
                onSaved(defaults)
                Alert.alert('Settings', 'Reset to defaults.')
              } catch (error) {
                console.log('dashSettings reset failed:', error)
                Alert.alert('Settings', 'Could not reset settings.')
              } finally {
                setSaving(false)
              }
            })()
          },
        },
      ],
    )
  }, [onSaved])

  const handlePickCert = useCallback(async () => {
    setCertBusy(true)
    try {
      const status = await pickAndSaveLocalCert()
      setCertInstalled(!!status.installed)
      onLocalCertChanged?.()
      Alert.alert('Settings', 'Certificate loaded. Dashboard will reload.')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/cancel/i.test(message)) {
        console.log('dashCert pick failed:', error)
        Alert.alert('Settings', 'Could not load certificate.')
      }
    } finally {
      setCertBusy(false)
    }
  }, [onLocalCertChanged])

  const handleClearCert = useCallback(async () => {
    setCertBusy(true)
    try {
      await clearLocalCert()
      setCertInstalled(false)
      onLocalCertChanged?.()
      Alert.alert('Settings', 'Certificate removed. Dashboard will reload.')
    } catch (error) {
      console.log('dashCert clear failed:', error)
      Alert.alert('Settings', 'Could not remove certificate.')
    } finally {
      setCertBusy(false)
    }
  }, [onLocalCertChanged])

  const handleCertQrScanned = useCallback(
    async (value: string) => {
      setCertQrOpen(false)
      setCertBusy(true)
      try {
        const status = await saveLocalCertFromPayload(value)
        setCertInstalled(!!status.installed)
        onLocalCertChanged?.()
        Alert.alert('Settings', 'Certificate loaded from QR. Dashboard will reload.')
      } catch (error) {
        console.log('dashCert QR save failed:', error)
        Alert.alert(
          'Settings',
          'Could not load certificate from QR. Encode the PEM or base64 DER of the cert in the QR.',
        )
      } finally {
        setCertBusy(false)
      }
    },
    [onLocalCertChanged],
  )

  const connectionKindLabel =
    activeConnectionKind === 'local'
      ? 'Local'
      : activeConnectionKind === 'remote'
        ? 'Online'
        : null

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor }]}>
        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <Pressable onPress={onClose} hitSlop={8} style={styles.headerBtn}>
            <IonIcon name="close" size={24} color={textColor} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: textColor }]}>Settings</Text>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={textColor} />
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.root, { backgroundColor }]}>
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <Pressable onPress={onClose} hitSlop={8} style={styles.headerBtn} accessibilityLabel="Close settings">
          <IonIcon name="close" size={24} color={textColor} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: textColor }]}>Settings</Text>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          hitSlop={8}
          style={styles.headerBtn}
          accessibilityLabel="Save settings"
        >
          <Text style={[styles.saveLabel, { color: saving ? mutedColor : '#2196F3' }]}>
            {saving ? '…' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Active connection</Text>
          <Text style={[styles.hint, { color: mutedColor }]}>
            {connectionKindLabel
              ? `Using ${connectionKindLabel.toLowerCase()} URL`
              : 'Resolving…'}
          </Text>
          <Text selectable style={[styles.activeUrl, { color: textColor }]}>
            {activeConnectionUrl ?? '—'}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Online URL</Text>
          <Text style={[styles.hint, { color: mutedColor }]}>
            Used when no local server responds. Basic auth is sent only for this URL.
          </Text>
          <TextInput
            value={remoteUrl}
            onChangeText={setRemoteUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder={getDefaultDashSettings().remoteUrl}
            placeholderTextColor={mutedColor}
            style={[
              styles.input,
              { color: textColor, borderColor, backgroundColor: inputBg },
            ]}
          />
          <Text style={[styles.fieldLabel, { color: mutedColor }]}>Username</Text>
          <TextInput
            value={remoteUsername}
            onChangeText={setRemoteUsername}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            autoComplete="username"
            placeholder="Basic auth username"
            placeholderTextColor={mutedColor}
            style={[
              styles.input,
              { color: textColor, borderColor, backgroundColor: inputBg },
            ]}
          />
          <Text style={[styles.fieldLabel, { color: mutedColor }]}>Password</Text>
          <TextInput
            value={remotePassword}
            onChangeText={setRemotePassword}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            textContentType="password"
            autoComplete="password"
            placeholder="Basic auth password"
            placeholderTextColor={mutedColor}
            style={[
              styles.input,
              { color: textColor, borderColor, backgroundColor: inputBg },
            ]}
          />
        </View>

        <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Local URLs</Text>
          <Text style={[styles.hint, { color: mutedColor }]}>
            Probed in order at startup; first reachable wins.
          </Text>
          {localUrls.map((url, index) => (
            <View key={`local-${index}`} style={styles.localRow}>
              <TextInput
                value={url}
                onChangeText={(value) => updateLocalUrl(index, value)}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholderTextColor={mutedColor}
                style={[
                  styles.input,
                  styles.localInput,
                  { color: textColor, borderColor, backgroundColor: inputBg },
                ]}
              />
              <Pressable
                onPress={() => removeLocalUrl(index)}
                hitSlop={8}
                style={styles.iconBtn}
                accessibilityLabel="Remove local URL"
              >
                <IonIcon name="remove-circle-outline" size={24} color="#e53935" />
              </Pressable>
            </View>
          ))}
          <Pressable onPress={addLocalUrl} style={styles.addRow} hitSlop={8}>
            <IonIcon name="add-circle-outline" size={22} color="#2196F3" />
            <Text style={styles.addLabel}>Add local URL</Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Local HTTPS certificate</Text>
          <Text style={[styles.hint, { color: mutedColor }]}>
            Trust a self-signed or local CA cert only inside this app’s WebView (not system-wide).
            QR must contain the certificate itself (PEM or base64), not a URL.
          </Text>
          <Text style={[styles.fieldLabel, { color: mutedColor }]}>
            Status: {certInstalled ? 'Loaded' : 'None'}
          </Text>
          <Pressable
            onPress={handlePickCert}
            disabled={certBusy || saving}
            style={styles.addRow}
            hitSlop={8}
          >
            <IonIcon name="document-attach-outline" size={22} color="#2196F3" />
            <Text style={styles.addLabel}>
              {certBusy ? 'Working…' : certInstalled ? 'Replace certificate…' : 'Add certificate…'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setCertQrOpen(true)}
            disabled={certBusy || saving}
            style={styles.addRow}
            hitSlop={8}
          >
            <IonIcon name="qr-code-outline" size={22} color="#2196F3" />
            <Text style={styles.addLabel}>Scan certificate QR…</Text>
          </Pressable>
          {certInstalled ? (
            <Pressable
              onPress={handleClearCert}
              disabled={certBusy || saving}
              style={styles.addRow}
              hitSlop={8}
            >
              <IonIcon name="trash-outline" size={22} color="#e53935" />
              <Text style={[styles.addLabel, { color: '#e53935' }]}>Remove certificate</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          onPress={handleReset}
          disabled={saving}
          style={[styles.resetBtn, { borderColor }]}
        >
          <Text style={styles.resetLabel}>Reset to defaults</Text>
        </Pressable>
      </ScrollView>

      <CertQrScanner
        visible={certQrOpen}
        onClose={() => setCertQrOpen(false)}
        onScanned={handleCertQrScanned}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    minWidth: 56,
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  saveLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
    marginTop: -4,
  },
  fieldLabel: {
    fontSize: 13,
    marginBottom: -4,
  },
  activeUrl: {
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  localRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  localInput: {
    flex: 1,
  },
  iconBtn: {
    padding: 4,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  addLabel: {
    color: '#2196F3',
    fontSize: 15,
    fontWeight: '500',
  },
  resetBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  resetLabel: {
    color: '#e53935',
    fontSize: 15,
    fontWeight: '600',
  },
})
