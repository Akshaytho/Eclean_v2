/**
 * PhotoPreview — clean review screen after capture.
 * Shows photo full-screen with minimal overlay.
 * GPS/hash/device hidden — user just sees "Verified" badge.
 */

import React from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, ActivityIndicator, StatusBar,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RotateCcw, Check, Shield } from 'lucide-react-native'
import type { PhotoType, CaptureMetadata } from './CaptureCamera'

interface PhotoPreviewProps {
  uri:       string
  metadata:  CaptureMetadata
  photoType: PhotoType
  saving:    boolean
  saved?:    boolean
  onRetake:  () => void
  onConfirm: (uri: string, metadata: CaptureMetadata) => void
}

const TYPE_CONFIG = {
  BEFORE:  { label: 'BEFORE',  color: '#F59E0B' },
  AFTER:   { label: 'AFTER',   color: '#10B981' },
  PROOF:   { label: 'PROOF',   color: '#3B82F6' },
  GENERAL: { label: 'PHOTO',   color: '#8B5CF6' },
}

export function PhotoPreview({ uri, metadata, photoType, saving, saved, onRetake, onConfirm }: PhotoPreviewProps) {
  const insets = useSafeAreaInsets()
  const cfg    = TYPE_CONFIG[photoType]
  const hasGps = metadata.lat !== null && metadata.lng !== null

  return (
    <View style={s.container}>
      <StatusBar hidden />

      {/* Full-screen photo */}
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />

      {/* Gradient overlays for readability */}
      <View style={s.topFade} />
      <View style={s.bottomFade} />

      {/* Top bar — type badge + verification status */}
      <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
        <View style={[s.typePill, { backgroundColor: cfg.color }]}>
          <Text style={s.typeText}>{cfg.label}</Text>
        </View>

        {/* Verified badge — replaces raw GPS/hash display */}
        <View style={[s.verifiedBadge, { backgroundColor: hasGps ? 'rgba(16,185,129,0.9)' : 'rgba(245,158,11,0.9)' }]}>
          <Shield size={12} color="#fff" />
          <Text style={s.verifiedText}>{hasGps ? 'Location verified' : 'No GPS'}</Text>
        </View>
      </View>

      {/* Bottom controls */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity style={s.retakeBtn} onPress={onRetake} disabled={saving} activeOpacity={0.85}>
          <RotateCcw size={18} color="#fff" />
          <Text style={s.retakeText}>Retake</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.confirmBtn, { backgroundColor: cfg.color }, saving && s.disabled]}
          onPress={() => onConfirm(uri, metadata)}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Check size={18} color="#fff" strokeWidth={3} />
              <Text style={s.confirmText}>Use Photo</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Saved overlay */}
      {saved && (
        <View style={s.savedOverlay}>
          <View style={s.savedCircle}>
            <Check size={32} color="#fff" strokeWidth={3} />
          </View>
          <Text style={s.savedText}>Saved</Text>
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#000' },

  // Gradient fades
  topFade:    { position: 'absolute', top: 0, left: 0, right: 0, height: 140, backgroundColor: 'rgba(0,0,0,0.5)' },
  bottomFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 180, backgroundColor: 'rgba(0,0,0,0.6)' },

  // Top
  topBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, zIndex: 10 },
  typePill:     { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 16 },
  typeText:     { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  verifiedBadge:{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16 },
  verifiedText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // Bottom
  bottomBar:   { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', paddingHorizontal: 20, gap: 12, zIndex: 10 },
  retakeBtn:   {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  retakeText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  confirmBtn:  {
    flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: 16,
  },
  confirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled:    { opacity: 0.5 },

  // Saved
  savedOverlay:{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  savedCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  savedText:   { color: '#fff', fontSize: 18, fontWeight: '800' },
})
