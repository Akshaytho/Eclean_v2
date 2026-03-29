/**
 * CaptureCamera — eClean's evidence-grade camera component.
 *
 * ABSTRACTION: Hides expo-camera, expo-location, expo-image-manipulator, expo-device.
 * Screens only receive CaptureResult — never touch underlying libs.
 */

import React, { useRef, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, StatusBar, ActivityIndicator, Alert,
} from 'react-native'
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera'
import * as Location from 'expo-location'

import * as Device from 'expo-device'
import * as Haptics from 'expo-haptics'
import * as Crypto from 'expo-crypto'
import * as FileSystem from 'expo-file-system/legacy'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, RotateCcw, Zap, ZapOff } from 'lucide-react-native'
import { COLORS } from '../../constants/colors'
import { saveToGallery, GalleryPhoto } from '../../services/galleryService'
import { PhotoPreview } from './PhotoPreview'

const { width: SW, height: SH } = Dimensions.get('window')

export type PhotoType = 'BEFORE' | 'AFTER' | 'PROOF' | 'GENERAL'

export interface CaptureResult {
  photo:    GalleryPhoto  // saved to in-app gallery
  uploaded: boolean       // false until uploaded to Cloudinary
}

export interface CaptureMetadata {
  lat:       number | null
  lng:       number | null
  timestamp: string       // ISO UTC — captured at shutter press moment
  deviceId:  string
  taskId:    string | null
  photoHash: string       // SHA-256 of raw photo bytes — tamper-proof evidence
}

interface CaptureCameraProps {
  taskId:    string | null  // null = dashboard quick capture
  photoType: PhotoType
  onCapture: (result: CaptureResult) => void
  onClose:   () => void
}

const PHOTO_TYPE_CONFIG: Record<PhotoType, { label: string; color: string; hint: string }> = {
  BEFORE:  { label: 'BEFORE',  color: '#F59E0B', hint: 'Capture the area BEFORE cleaning' },
  AFTER:   { label: 'AFTER',   color: '#2E8B57', hint: 'Capture the area AFTER cleaning' },
  PROOF:   { label: 'PROOF',   color: '#3B82F6', hint: 'Capture yourself at the location' },
  GENERAL: { label: 'CAPTURE', color: '#8B5CF6', hint: 'Take a photo' },
}

export function CaptureCamera({ taskId, photoType, onCapture, onClose }: CaptureCameraProps) {
  const [permission, requestPermission] = useCameraPermissions()
  const [facing,    setFacing]          = useState<CameraType>('back')
  const [flash,     setFlash]           = useState(false)
  const [capturing, setCapturing]       = useState(false)
  const [saving,    setSaving]          = useState(false)
  // preview holds both the URI and metadata captured at shutter press
  const [preview,   setPreview]         = useState<{ uri: string; metadata: CaptureMetadata } | null>(null)
  const [saved,     setSaved]           = useState(false)
  const cameraRef = useRef<CameraView>(null)
  const insets    = useSafeAreaInsets()
  const cfg       = PHOTO_TYPE_CONFIG[photoType]

  // ── Shutter press (must be before early returns — Rules of Hooks) ──────────
  const onShutter = useCallback(async () => {
    if (!cameraRef.current || capturing) return
    setCapturing(true)

    try {
      // Capture photo + GPS simultaneously at shutter press
      const [photo, locResult] = await Promise.all([
        cameraRef.current.takePictureAsync({ quality: 0.92, skipProcessing: false }),
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }).catch(() => null),
      ])

      if (!photo) throw new Error('Camera failed to capture')

      // SHA-256 hash — non-blocking, fallback if it fails
      let photoHash = ''
      try {
        const photoBase64 = await FileSystem.readAsStringAsync(photo.uri, { encoding: FileSystem.EncodingType.Base64 })
        photoHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, photoBase64)
      } catch {
        photoHash = `fallback-${Date.now()}`
      }

      // Build metadata at the exact moment of capture
      const metadata: CaptureMetadata = {
        lat:       locResult?.coords.latitude  ?? null,
        lng:       locResult?.coords.longitude ?? null,
        timestamp: new Date().toISOString(),
        deviceId:  Device.modelId ?? Device.deviceName ?? 'unknown',
        taskId,
        photoHash,
      }

      // Show preview with metadata attached
      setPreview({ uri: photo.uri, metadata })
      setCapturing(false)
    } catch (err: any) {
      setCapturing(false)
      console.error('CaptureCamera error:', err?.message ?? err)
      Alert.alert('Capture failed', err?.message ?? 'Could not take photo. Please try again.')
    }
  }, [capturing, taskId])

  // ── Confirm (after preview) ──────────────────────────────────────────────────
  const onConfirm = useCallback(async (uri: string, metadata: CaptureMetadata) => {
    setSaving(true)
    try {
      const galleryPhoto = await saveToGallery(uri, taskId, photoType, metadata)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setSaving(false)
      setSaved(true)
      // Show "Saved!" for 1 second before closing
      await new Promise(r => setTimeout(r, 1000))
      setSaved(false)
      setPreview(null)
      onCapture({ photo: galleryPhoto, uploaded: false })
    } catch (err: any) {
      setSaving(false)
      console.error('Save failed:', err?.message ?? err)
      Alert.alert('Save failed', err?.message ?? 'Could not save photo. Please retake.')
    }
  }, [taskId, photoType, onCapture])

  // ── Permission screen (after all hooks) ────────────────────────────────────
  if (!permission) return <View style={s.bg} />

  if (!permission.granted) {
    return (
      <View style={[s.bg, s.center]}>
        <Text style={s.permTitle}>Camera permission needed</Text>
        <Text style={s.permSub}>eClean needs camera access to capture evidence photos</Text>
        <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
          <Text style={s.permBtnText}>Grant Camera Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.closeBtn} onPress={onClose}>
          <X size={24} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>
    )
  }

  // ── Saved confirmation (full screen overlay) ─────────────────────────────────
  if (saved) {
    return (
      <View style={[s.bg, s.center]}>
        <View style={s.savedCircle}>
          <Text style={s.savedCheck}>✓</Text>
        </View>
        <Text style={s.savedTitle}>Photo Saved</Text>
        <Text style={s.savedSub}>Added to your gallery</Text>
      </View>
    )
  }

  // ── Preview screen ───────────────────────────────────────────────────────────
  if (preview) {
    return (
      <PhotoPreview
        uri={preview.uri}
        metadata={preview.metadata}
        photoType={photoType}
        saving={saving}
        onRetake={() => setPreview(null)}
        onConfirm={onConfirm}
      />
    )
  }

  // ── Camera screen ────────────────────────────────────────────────────────────
  return (
    <View style={s.bg}>
      <StatusBar hidden />

      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        flash={flash ? 'on' : 'off'}
      />

      {/* Top bar */}
      <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={onClose} style={s.iconBtn} hitSlop={12}>
          <X size={22} color="white" />
        </TouchableOpacity>
        <View style={[s.typeBadge, { backgroundColor: cfg.color }]}>
          <Text style={s.typeLabel}>{cfg.label}</Text>
        </View>
        <TouchableOpacity onPress={() => setFlash(f => !f)} style={s.iconBtn} hitSlop={12}>
          {flash
            ? <Zap size={22} color="#FFD700" fill="#FFD700" />
            : <ZapOff size={22} color="white" />
          }
        </TouchableOpacity>
      </View>

      {/* Hint */}
      <View style={s.hintRow}>
        <Text style={s.hint}>{cfg.hint}</Text>
      </View>

      {/* Viewfinder corners */}
      <View style={s.viewfinder} pointerEvents="none">
        {(['TL','TR','BL','BR'] as const).map(pos => (
          <View key={pos} style={[
            s.corner,
            pos.includes('T') ? s.cornerT : s.cornerB,
            pos.includes('L') ? s.cornerL : s.cornerR,
            { borderColor: cfg.color }
          ]} />
        ))}
      </View>

      {/* Bottom controls */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + 24 }]}>
        <TouchableOpacity style={s.sideBtn} onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}>
          <RotateCcw size={26} color="white" />
          <Text style={s.sideBtnText}>Flip</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.shutter, capturing && s.shutterActive]}
          onPress={() => void onShutter()}
          activeOpacity={0.8}
          disabled={capturing}
        >
          {capturing
            ? <ActivityIndicator color={cfg.color} size="large" />
            : <View style={[s.shutterInner, { backgroundColor: cfg.color }]} />
          }
        </TouchableOpacity>

        <View style={s.sideBtn} />
      </View>

      {/* Evidence notice */}
      <View style={[s.evidenceBar, { bottom: insets.bottom }]}>
        <Text style={s.evidenceText}>🔒 GPS + timestamp recorded automatically</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  bg:            { flex: 1, backgroundColor: '#000' },
  center:        { alignItems: 'center', justifyContent: 'center', padding: 32 },
  topBar:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, zIndex: 10 },
  iconBtn:       { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20 },
  typeBadge:     { paddingHorizontal: 20, paddingVertical: 7, borderRadius: 20 },
  typeLabel:     { color: 'white', fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },
  hintRow:       { alignItems: 'center', marginTop: 12, zIndex: 10 },
  hint:          { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '500' },
  viewfinder:    { position: 'absolute', top: SH * 0.18, left: SW * 0.08, right: SW * 0.08, bottom: SH * 0.22 },
  corner:        { position: 'absolute', width: 28, height: 28, borderWidth: 3 },
  cornerT:       { top: 0 },
  cornerB:       { bottom: 0 },
  cornerL:       { left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerR:       { right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  bottomBar:     { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 40, paddingTop: 20 },
  sideBtn:       { width: 50, alignItems: 'center' },
  sideBtnText:   { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 4 },
  shutter:       { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: 'white', alignItems: 'center', justifyContent: 'center' },
  shutterActive: { opacity: 0.7 },
  shutterInner:  { width: 62, height: 62, borderRadius: 31 },
  evidenceBar:   { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingVertical: 6 },
  evidenceText:  { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '500' },
  permTitle:     { color: 'white', fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  permSub:       { color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center', marginBottom: 32, lineHeight: 20 },
  permBtn:       { backgroundColor: COLORS.brand.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  permBtnText:   { color: 'white', fontSize: 15, fontWeight: '700' },
  closeBtn:      { position: 'absolute', top: 60, right: 24 },
  savedCircle:   { width: 90, height: 90, borderRadius: 45, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  savedCheck:    { color: '#fff', fontSize: 40, fontWeight: '800' },
  savedTitle:    { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 6 },
  savedSub:      { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
})
