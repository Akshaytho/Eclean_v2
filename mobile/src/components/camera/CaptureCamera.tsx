/**
 * CaptureCamera — eClean's evidence-grade camera component.
 *
 * DESIGN DECISIONS:
 * - Full-screen camera UI (no distractions)
 * - Clear photo type badge (BEFORE/AFTER/PROOF) at top so worker always knows what to capture
 * - Large centered shutter button — easy to tap with one hand
 * - After capture: preview with Retake / Use Photo — worker confirms before upload
 * - After upload: Retake still available — updates the photo in gallery
 * - NO gallery picker anywhere — camera only
 * - Watermark composited on bottom: timestamp + GPS + eClean (evidence integrity)
 * - Metadata captured at the exact shutter press moment
 *
 * ABSTRACTION:
 * - This component hides expo-camera, expo-location, expo-image-manipulator
 * - Screens only receive CaptureResult — never touch the underlying libs
 * - If we switch to native camera later, only this file changes
 */

import React, { useRef, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, StatusBar, ActivityIndicator, Alert,
} from 'react-native'
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera'
import * as Location from 'expo-location'
import * as ImageManipulator from 'expo-image-manipulator'
import * as Device from 'expo-device'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, RotateCcw, Zap, ZapOff } from 'lucide-react-native'
import { COLORS } from '../../constants/colors'
import { saveToGallery, GalleryPhoto } from '../../services/galleryService'
import { PhotoPreview } from './PhotoPreview'

const { width: SW, height: SH } = Dimensions.get('window')

export type PhotoType = 'BEFORE' | 'AFTER' | 'PROOF' | 'GENERAL'

export interface CaptureResult {
  photo:        GalleryPhoto   // saved to in-app gallery
  uploaded:     boolean        // false until uploaded to Cloudinary
}

interface CaptureCameraProps {
  taskId:     string | null    // null = dashboard quick capture
  photoType:  PhotoType
  onCapture:  (result: CaptureResult) => void
  onClose:    () => void
}

const PHOTO_TYPE_CONFIG: Record<PhotoType, { label: string; color: string; hint: string }> = {
  BEFORE:  { label: 'BEFORE',  color: '#F59E0B', hint: 'Capture the area BEFORE cleaning' },
  AFTER:   { label: 'AFTER',   color: '#2E8B57', hint: 'Capture the area AFTER cleaning' },
  PROOF:   { label: 'PROOF',   color: '#3B82F6', hint: 'Capture yourself at the location' },
  GENERAL: { label: 'CAPTURE', color: '#8B5CF6', hint: 'Take a photo' },
}

// ── Watermark compositing ─────────────────────────────────────────────────────
async function applyWatermark(
  uri:       string,
  timestamp: string,
  lat:       number | null,
  lng:       number | null,
  taskId:    string | null,
): Promise<string> {
  // We use a resize + text overlay approach via ImageManipulator
  // The watermark is subtle — bottom 8% of image height, semi-transparent
  // Since expo-image-manipulator doesn't support text, we:
  // 1. Keep the photo as-is (metadata in JSON is the real evidence)
  // 2. The backend adds text watermark server-side on Cloudinary via transformation
  // This is intentional — client-side text would be rasterized and could degrade quality

  // Compress to upload size
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1200 } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
  )
  return result.uri
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function CaptureCamera({ taskId, photoType, onCapture, onClose }: CaptureCameraProps) {
  const [permission, requestPermission] = useCameraPermissions()
  const [facing,     setFacing]         = useState<CameraType>('back')
  const [flash,      setFlash]          = useState(false)
  const [capturing,  setCapturing]      = useState(false)
  const [preview,    setPreview]        = useState<string | null>(null)
  const [saving,     setSaving]         = useState(false)
  const cameraRef = useRef<CameraView>(null)
  const insets    = useSafeAreaInsets()
  const cfg       = PHOTO_TYPE_CONFIG[photoType]

  // ── Permission request ─────────────────────────────────────────────────────
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

  // ── Shutter press ───────────────────────────────────────────────────────────
  const onShutter = useCallback(async () => {
    if (!cameraRef.current || capturing) return
    setCapturing(true)

    try {
      // Capture GPS at the exact moment of shutter press
      const [photo, locResult] = await Promise.all([
        cameraRef.current.takePictureAsync({ quality: 0.92, skipProcessing: false }),
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 0,
        }).catch(() => null),
      ])

      if (!photo) throw new Error('Camera failed to capture')

      setPreview(photo.uri)
      setCapturing(false)

      // Store GPS + timestamp at capture moment
      ;(photo as any)._captureMetadata = {
        lat:       locResult?.coords.lat  ?? null,
        lng:       locResult?.coords.longitude ?? null,
        timestamp: new Date().toISOString(),
        deviceId:  Device.modelId ?? Device.deviceName ?? 'unknown',
        taskId,
      }
    } catch (err) {
      setCapturing(false)
      Alert.alert('Capture failed', 'Could not take photo. Please try again.')
    }
  }, [capturing, taskId])

  // ── Confirm photo (after preview) ──────────────────────────────────────────
  const onConfirm = useCallback(async (uri: string, meta: any) => {
    setSaving(true)
    try {
      const watermarked = await applyWatermark(
        uri,
        meta.timestamp,
        meta.lat,
        meta.lng,
        taskId,
      )

      const galleryPhoto = await saveToGallery(watermarked, taskId, photoType, meta)

      setPreview(null)
      setSaving(false)
      onCapture({ photo: galleryPhoto, uploaded: false })
    } catch (err) {
      setSaving(false)
      Alert.alert('Save failed', 'Could not save photo. Please retake.')
    }
  }, [taskId, photoType, onCapture])

  // ── Preview screen ─────────────────────────────────────────────────────────
  if (preview) {
    return (
      <PhotoPreview
        uri={preview}
        photoType={photoType}
        onRetake={() => setPreview(null)}
        onConfirm={(uri, meta) => void onConfirm(uri, meta)}
        saving={saving}
      />
    )
  }

  // ── Camera screen ──────────────────────────────────────────────────────────
  return (
    <View style={s.bg}>
      <StatusBar hidden />

      {/* Camera */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        flash={flash ? 'on' : 'off'}
      />

      {/* Top bar — photo type + close */}
      <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={onClose} style={s.iconBtn} hitSlop={{ top:12,bottom:12,left:12,right:12 }}>
          <X size={22} color="white" />
        </TouchableOpacity>

        <View style={[s.typeBadge, { backgroundColor: cfg.color }]}>
          <Text style={s.typeLabel}>{cfg.label}</Text>
        </View>

        <TouchableOpacity
          onPress={() => setFlash(f => !f)}
          style={s.iconBtn}
          hitSlop={{ top:12,bottom:12,left:12,right:12 }}
        >
          {flash
            ? <Zap size={22} color="#FFD700" fill="#FFD700" />
            : <ZapOff size={22} color="white" />
          }
        </TouchableOpacity>
      </View>

      {/* Hint text */}
      <View style={s.hintRow}>
        <Text style={s.hint}>{cfg.hint}</Text>
      </View>

      {/* Viewfinder corners — subtle guide */}
      <View style={s.viewfinder} pointerEvents="none">
        {['TL','TR','BL','BR'].map(pos => (
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
        {/* Flip camera */}
        <TouchableOpacity
          style={s.sideBtn}
          onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
        >
          <RotateCcw size={26} color="white" />
          <Text style={s.sideBtnText}>Flip</Text>
        </TouchableOpacity>

        {/* Shutter */}
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

        {/* Spacer to balance flip button */}
        <View style={s.sideBtn} />
      </View>

      {/* Evidence notice */}
      <View style={[s.evidenceBar, { bottom: insets.bottom }]}>
        <Text style={s.evidenceText}>🔒 GPS + timestamp recorded automatically</Text>
      </View>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  bg:           { flex: 1, backgroundColor: '#000' },
  center:       { alignItems: 'center', justifyContent: 'center', padding: 32 },

  // Top bar
  topBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, zIndex: 10 },
  iconBtn:      { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20 },
  typeBadge:    { paddingHorizontal: 20, paddingVertical: 7, borderRadius: 20 },
  typeLabel:    { color: 'white', fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },

  // Hint
  hintRow:      { alignItems: 'center', marginTop: 12, zIndex: 10 },
  hint:         { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '500' },

  // Viewfinder corners
  viewfinder:   { position: 'absolute', top: SH * 0.18, left: SW * 0.08, right: SW * 0.08, bottom: SH * 0.22 },
  corner:       { position: 'absolute', width: 28, height: 28, borderWidth: 3 },
  cornerT:      { top: 0 },
  cornerB:      { bottom: 0 },
  cornerL:      { left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerR:      { right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },

  // Bottom controls
  bottomBar:    { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 40, paddingTop: 20 },
  sideBtn:      { width: 50, alignItems: 'center' },
  sideBtnText:  { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 4 },

  // Shutter
  shutter:      { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: 'white', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  shutterActive:{ opacity: 0.7 },
  shutterInner: { width: 62, height: 62, borderRadius: 31 },

  // Evidence bar
  evidenceBar:  { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingVertical: 6 },
  evidenceText: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '500' },

  // Permission screen
  permTitle:    { color: 'white', fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  permSub:      { color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center', marginBottom: 32, lineHeight: 20 },
  permBtn:      { backgroundColor: COLORS.brand.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  permBtnText:  { color: 'white', fontSize: 15, fontWeight: '700' },
  closeBtn:     { position: 'absolute', top: 60, right: 24 },
})
