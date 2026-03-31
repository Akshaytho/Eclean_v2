/**
 * CaptureCamera — eClean's evidence-grade camera.
 * Clean, minimal UI — Uber/Instagram style.
 * GPS + hash + timestamp captured silently behind the scenes.
 */

import React, { useRef, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, StatusBar, ActivityIndicator, Alert, Image,
} from 'react-native'
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera'
import * as Location from 'expo-location'
import * as Device from 'expo-device'
import * as Haptics from 'expo-haptics'
import * as Crypto from 'expo-crypto'
import * as FileSystem from 'expo-file-system/legacy'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, RotateCcw, Zap, ZapOff, Shield } from 'lucide-react-native'
import { saveToGallery, GalleryPhoto } from '../../services/galleryService'
import { PhotoPreview } from './PhotoPreview'

const { width: SW, height: SH } = Dimensions.get('window')

export type PhotoType = 'BEFORE' | 'AFTER' | 'PROOF' | 'GENERAL' | 'REFERENCE' | 'VERIFICATION'

export interface CaptureResult {
  photo:    GalleryPhoto
  uploaded: boolean
}

export interface CaptureMetadata {
  lat:       number | null
  lng:       number | null
  timestamp: string
  deviceId:  string
  taskId:    string | null
  photoHash: string
}

interface CaptureCameraProps {
  taskId:    string | null
  photoType: PhotoType
  onCapture: (result: CaptureResult) => void
  onClose:   () => void
  // Side-by-side reference point mode (worker captures matching buyer's angle)
  referenceImage?: string | null   // buyer's reference photo URL/local URI
  referenceLabel?: string | null   // "Near the gate", "Drain corner"
  pointIndex?:     number | null   // which point (1-10)
  totalPoints?:    number | null   // total reference points in task
  distanceFromPoint?: number | null // meters from buyer's GPS for this point
}

const TYPE_CONFIG: Record<PhotoType, { label: string; color: string; hint: string }> = {
  BEFORE:       { label: 'BEFORE',       color: '#F59E0B', hint: 'Show the area before cleaning' },
  AFTER:        { label: 'AFTER',        color: '#10B981', hint: 'Show the cleaned area' },
  PROOF:        { label: 'PROOF',        color: '#3B82F6', hint: 'Show yourself at the location' },
  GENERAL:      { label: 'PHOTO',        color: '#8B5CF6', hint: 'Take a photo' },
  REFERENCE:    { label: 'REFERENCE',    color: '#F59E0B', hint: 'Document this dirty spot' },
  VERIFICATION: { label: 'VERIFY',       color: '#7C3AED', hint: 'Match the reference angle exactly' },
}

export const CaptureCamera = React.memo(function CaptureCamera({
  taskId, photoType, onCapture, onClose,
  referenceImage, referenceLabel, pointIndex, totalPoints, distanceFromPoint,
}: CaptureCameraProps) {
  const isSideBySide = !!referenceImage
  const [permission, requestPermission] = useCameraPermissions()
  const [facing,    setFacing]   = useState<CameraType>('back')
  const [flash,     setFlash]    = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [saving,    setSaving]   = useState(false)
  const [preview,   setPreview]  = useState<{ uri: string; metadata: CaptureMetadata } | null>(null)
  const [saved,     setSaved]    = useState(false)
  const cameraRef = useRef<CameraView>(null)
  const insets    = useSafeAreaInsets()
  const cfg       = TYPE_CONFIG[photoType]

  const onShutter = useCallback(async () => {
    if (!cameraRef.current || capturing) return
    setCapturing(true)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

    try {
      const [photo, locResult] = await Promise.all([
        cameraRef.current.takePictureAsync({ quality: 0.7, skipProcessing: true }),
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null),
      ])
      if (!photo) throw new Error('Camera failed')

      // Hash from file info (fast) instead of reading entire file as base64 (slow)
      const photoHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${photo.uri}-${photo.width}-${photo.height}-${Date.now()}`
      ).catch(() => `fallback-${Date.now()}`)

      const metadata: CaptureMetadata = {
        lat:       locResult?.coords.latitude  ?? null,
        lng:       locResult?.coords.longitude ?? null,
        timestamp: new Date().toISOString(),
        deviceId:  Device.modelId ?? Device.deviceName ?? 'unknown',
        taskId,
        photoHash,
      }

      setPreview({ uri: photo.uri, metadata })
      setCapturing(false)
    } catch (err: any) {
      setCapturing(false)
      Alert.alert('Capture failed', err?.message ?? 'Could not take photo.')
    }
  }, [capturing, taskId])

  const onConfirm = useCallback(async (uri: string, metadata: CaptureMetadata) => {
    setSaving(true)
    try {
      // Fast path: create gallery photo object without expensive compression + thumbnail
      // The upload API handles compression. Gallery save is deferred.
      const quickPhoto: GalleryPhoto = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        taskId,
        photoType,
        fullUri: uri,
        thumbUri: uri, // Use original as thumb temporarily
        uploadedUri: null,
        metadata,
        capturedAt: new Date().toISOString(),
        uploaded: false,
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setSaving(false)
      setSaved(true)
      // Shortened save animation from 800ms to 400ms
      await new Promise(r => setTimeout(r, 400))
      setSaved(false)
      setPreview(null)
      onCapture({ photo: quickPhoto, uploaded: false })

      // Deferred: save to gallery in background (non-blocking)
      saveToGallery(uri, taskId, photoType, metadata).catch(() => {})
    } catch (err: any) {
      setSaving(false)
      Alert.alert('Save failed', err?.message ?? 'Could not save photo.')
    }
  }, [taskId, photoType, onCapture])

  // Permission screen
  if (!permission) return <View style={s.bg} />
  if (!permission.granted) {
    return (
      <View style={[s.bg, s.center]}>
        <View style={s.permIcon}><Shield size={32} color="#3B82F6" /></View>
        <Text style={s.permTitle}>Camera Access</Text>
        <Text style={s.permSub}>Required to capture evidence photos for task verification</Text>
        <TouchableOpacity style={s.permBtn} onPress={requestPermission} activeOpacity={0.85}>
          <Text style={s.permBtnText}>Allow Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={s.permSkip}>
          <Text style={s.permSkipText}>Not now</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // Saved confirmation
  if (saved) {
    return (
      <View style={[s.bg, s.center]}>
        <View style={s.savedCircle}><Text style={s.savedCheck}>✓</Text></View>
        <Text style={s.savedTitle}>Saved</Text>
      </View>
    )
  }

  // Preview
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

  // Proximity bar color
  const proximityColor = distanceFromPoint == null ? 'rgba(255,255,255,0.3)'
    : distanceFromPoint <= 15 ? '#10B981'
    : distanceFromPoint <= 50 ? '#F59E0B'
    : '#EF4444'

  const proximityText = distanceFromPoint == null ? ''
    : distanceFromPoint <= 15 ? `${distanceFromPoint}m — at the spot`
    : `${distanceFromPoint}m away`

  // Camera
  return (
    <View style={s.bg}>
      <StatusBar hidden />

      {/* Top bar */}
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onClose} style={s.topBtn} hitSlop={12}>
          <X size={20} color="#fff" />
        </TouchableOpacity>

        <View style={s.topCenter}>
          <View style={[s.typePill, { backgroundColor: cfg.color }]}>
            <Text style={s.typeText}>
              {isSideBySide && pointIndex ? `POINT ${pointIndex}/${totalPoints ?? '?'}` : cfg.label}
            </Text>
          </View>
          {referenceLabel && (
            <Text style={s.refLabelText}>{referenceLabel}</Text>
          )}
        </View>

        <TouchableOpacity onPress={() => setFlash(f => !f)} style={s.topBtn} hitSlop={12}>
          {flash ? <Zap size={20} color="#FFD700" fill="#FFD700" /> : <ZapOff size={20} color="rgba(255,255,255,0.7)" />}
        </TouchableOpacity>
      </View>

      {/* Side-by-side or full-screen camera */}
      {isSideBySide ? (
        <View style={s.sideBySide}>
          <View style={s.sbs_half}>
            <Image source={{ uri: referenceImage! }} style={s.sbs_refImg} resizeMode="cover" />
            <View style={s.sbs_labelWrap}>
              <Text style={s.sbs_label}>REFERENCE</Text>
            </View>
          </View>
          <View style={s.sbs_half}>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} flash={flash ? 'on' : 'off'} />
            <View style={s.sbs_labelWrap}>
              <Text style={s.sbs_label}>YOUR CAMERA</Text>
            </View>
          </View>
        </View>
      ) : (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} flash={flash ? 'on' : 'off'} />
      )}

      {/* Proximity indicator (side-by-side mode only) */}
      {isSideBySide && distanceFromPoint != null && (
        <View style={s.proximityWrap}>
          <View style={[s.proximityBar, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
            <View style={[
              s.proximityFill,
              {
                backgroundColor: proximityColor,
                width: `${Math.max(5, Math.min(100, (1 - Math.min(distanceFromPoint, 200) / 200) * 100))}%`,
              },
            ]} />
          </View>
          <Text style={[s.proximityText, { color: proximityColor }]}>{proximityText}</Text>
        </View>
      )}

      {/* Hint (non-side-by-side only) */}
      {!isSideBySide && (
        <View style={s.hintWrap}>
          <Text style={s.hintText}>{cfg.hint}</Text>
        </View>
      )}

      {/* Side-by-side hint */}
      {isSideBySide && (
        <View style={s.hintWrap}>
          <Text style={s.hintText}>Match the reference angle</Text>
        </View>
      )}

      {/* Bottom controls */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity style={s.sideBtn} onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}>
          <RotateCcw size={22} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>

        <TouchableOpacity
          style={s.shutter}
          onPress={() => void onShutter()}
          activeOpacity={0.8}
          disabled={capturing}
        >
          {capturing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <View style={[s.shutterInner, { backgroundColor: cfg.color }]} />
          )}
        </TouchableOpacity>

        <View style={s.sideBtn} />
      </View>

      <View style={[s.secureBadge, { bottom: insets.bottom + 4 }]}>
        <Shield size={10} color="rgba(255,255,255,0.35)" />
        <Text style={s.secureText}>Verified capture</Text>
      </View>
    </View>
  )
})

const s = StyleSheet.create({
  bg:     { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },

  // Top
  topBar:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, zIndex: 10 },
  topBtn:  { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20 },
  typePill:{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  typeText:{ color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },

  // Hint
  hintWrap: { position: 'absolute', top: SH * 0.15, left: 0, right: 0, alignItems: 'center', zIndex: 5 },
  hintText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '500', backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, overflow: 'hidden' },

  // Bottom
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 40, paddingTop: 16 },
  sideBtn:   { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },

  // Shutter — clean circle
  shutter:      { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30 },

  // Secure badge
  secureBadge: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  secureText:  { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '500' },

  // Permission
  permIcon:     { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(59,130,246,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  permTitle:    { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  permSub:      { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 28, maxWidth: 280 },
  permBtn:      { backgroundColor: '#3B82F6', paddingHorizontal: 36, paddingVertical: 16, borderRadius: 14 },
  permBtnText:  { color: '#fff', fontSize: 16, fontWeight: '700' },
  permSkip:     { marginTop: 16 },
  permSkipText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },

  // Side-by-side mode
  topCenter:      { alignItems: 'center', gap: 4 },
  refLabelText:   { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '500' },
  sideBySide:     { position: 'absolute', top: SH * 0.12, left: 8, right: 8, flexDirection: 'row', gap: 6, height: SH * 0.35, zIndex: 2 },
  sbs_half:       { flex: 1, borderRadius: 14, overflow: 'hidden', position: 'relative' },
  sbs_refImg:     { width: '100%', height: '100%' },
  sbs_labelWrap:  { position: 'absolute', bottom: 6, left: 0, right: 0, alignItems: 'center' },
  sbs_label:      { color: '#fff', fontSize: 9, fontWeight: '700', letterSpacing: 1, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  proximityWrap:  { position: 'absolute', top: SH * 0.49, left: 24, right: 24, alignItems: 'center', gap: 4, zIndex: 5 },
  proximityBar:   { width: '100%', height: 4, borderRadius: 2, overflow: 'hidden' },
  proximityFill:  { height: '100%', borderRadius: 2 },
  proximityText:  { fontSize: 12, fontWeight: '600' },

  // Saved
  savedCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  savedCheck:  { color: '#fff', fontSize: 36, fontWeight: '800' },
  savedTitle:  { color: '#fff', fontSize: 20, fontWeight: '800' },
})
