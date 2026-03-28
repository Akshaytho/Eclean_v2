/**
 * PhotoPreview — shown after taking a photo, before confirming.
 * Receives full metadata from CaptureCamera (GPS, timestamp, deviceId).
 */

import React from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, ActivityIndicator, StatusBar,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RotateCcw, Check, MapPin, Clock } from 'lucide-react-native'
import { COLORS } from '../../constants/colors'
import type { PhotoType, CaptureMetadata } from './CaptureCamera'

interface PhotoPreviewProps {
  uri:       string
  metadata:  CaptureMetadata   // ✅ real metadata from shutter press, not re-created here
  photoType: PhotoType
  saving:    boolean
  onRetake:  () => void
  onConfirm: (uri: string, metadata: CaptureMetadata) => void
}

const PHOTO_TYPE_CONFIG = {
  BEFORE:  { label: 'BEFORE',  color: '#F59E0B' },
  AFTER:   { label: 'AFTER',   color: '#2E8B57' },
  PROOF:   { label: 'PROOF',   color: '#3B82F6' },
  GENERAL: { label: 'CAPTURE', color: '#8B5CF6' },
}

export function PhotoPreview({ uri, metadata, photoType, saving, onRetake, onConfirm }: PhotoPreviewProps) {
  const insets     = useSafeAreaInsets()
  const cfg        = PHOTO_TYPE_CONFIG[photoType]
  const capturedAt = new Date(metadata.timestamp)
  const hasGps     = metadata.lat !== null && metadata.lng !== null

  return (
    <View style={s.container}>
      <StatusBar hidden />

      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={s.topOverlay} />
      <View style={s.bottomOverlay} />

      {/* Top */}
      <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
        <View style={[s.typeBadge, { backgroundColor: cfg.color }]}>
          <Text style={s.typeLabel}>{cfg.label}</Text>
        </View>
        <Text style={s.previewLabel}>Preview</Text>
      </View>

      {/* Metadata confirmation chips */}
      <View style={[s.metaRow, { top: insets.top + 64 }]}>
        <View style={s.metaChip}>
          <Clock size={12} color="rgba(255,255,255,0.9)" />
          <Text style={s.metaText}>
            {capturedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <View style={[s.metaChip, !hasGps && s.metaChipWarn]}>
          <MapPin size={12} color={hasGps ? 'rgba(255,255,255,0.9)' : '#FBBF24'} />
          <Text style={[s.metaText, !hasGps && s.metaTextWarn]}>
            {hasGps
              ? `${metadata.lat!.toFixed(4)}, ${metadata.lng!.toFixed(4)}`
              : 'GPS unavailable'
            }
          </Text>
        </View>
      </View>

      {/* Bottom controls */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + 24 }]}>
        <TouchableOpacity style={s.retakeBtn} onPress={onRetake} disabled={saving} activeOpacity={0.8}>
          <RotateCcw size={20} color="white" />
          <Text style={s.retakeBtnText}>Retake</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.confirmBtn, { backgroundColor: cfg.color }, saving && s.disabled]}
          onPress={() => onConfirm(uri, metadata)}  // ✅ pass real metadata
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color="white" size="small" />
            : <><Check size={20} color="white" strokeWidth={3} /><Text style={s.confirmBtnText}>Use Photo</Text></>
          }
        </TouchableOpacity>
      </View>

      {/* Watermark band */}
      <View style={[s.watermarkBand, { bottom: insets.bottom + 80 }]}>
        <Text style={s.watermarkText}>
          eClean  •  {capturedAt.toLocaleDateString('en-IN')} {capturedAt.toLocaleTimeString('en-IN')}  •  Evidence photo
        </Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#000' },
  topOverlay:    { position: 'absolute', top: 0, left: 0, right: 0, height: 160, backgroundColor: 'rgba(0,0,0,0.55)' },
  bottomOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 200, backgroundColor: 'rgba(0,0,0,0.65)' },
  topBar:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, zIndex: 10 },
  typeBadge:     { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  typeLabel:     { color: 'white', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  previewLabel:  { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },
  metaRow:       { position: 'absolute', left: 24, right: 24, flexDirection: 'row', gap: 8, zIndex: 10 },
  metaChip:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  metaChipWarn:  { backgroundColor: 'rgba(146,64,14,0.6)' },
  metaText:      { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '600' },
  metaTextWarn:  { color: '#FBBF24' },
  bottomBar:     { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32, paddingTop: 16, gap: 16, zIndex: 10 },
  retakeBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.18)', paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  retakeBtnText: { color: 'white', fontSize: 15, fontWeight: '700' },
  confirmBtn:    { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 16 },
  confirmBtnText:{ color: 'white', fontSize: 15, fontWeight: '700' },
  disabled:      { opacity: 0.6 },
  watermarkBand: { position: 'absolute', left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 5, alignItems: 'center', zIndex: 10 },
  watermarkText: { color: 'rgba(255,255,255,0.6)', fontSize: 9, fontWeight: '600', letterSpacing: 0.5 },
})
