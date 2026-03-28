/**
 * DashboardCamera — quick camera access button shown on every profile dashboard.
 *
 * Each role's home screen includes this component.
 * Tapping opens CaptureCamera in GENERAL mode (not tied to a task).
 * Photo is saved to in-app gallery and available in GalleryScreen.
 *
 * This gives every user (worker, buyer, supervisor, citizen) a way to
 * quickly capture a photo from their dashboard — useful for:
 * - Worker: quick site documentation
 * - Supervisor: zone inspection evidence
 * - Citizen: reporting a problem without going through full CreateReport flow
 * - Buyer: documenting a task location before posting
 */

import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native'
import { Camera, Images } from 'lucide-react-native'
import { COLORS } from '../../constants/colors'
import { CaptureCamera } from './CaptureCamera'
import type { CaptureResult } from './CaptureCamera'

interface DashboardCameraProps {
  onPhotoTaken?:    (result: CaptureResult) => void  // optional callback
  onGalleryPress?:  () => void                        // navigate to gallery
  showGalleryBtn?:  boolean                           // default true
  style?:           object
}

export function DashboardCamera({
  onPhotoTaken,
  onGalleryPress,
  showGalleryBtn = true,
  style,
}: DashboardCameraProps) {
  const [cameraOpen, setCameraOpen] = useState(false)

  const handleCapture = (result: CaptureResult) => {
    setCameraOpen(false)
    onPhotoTaken?.(result)
  }

  return (
    <>
      <View style={[s.container, style]}>
        {/* Camera quick button */}
        <TouchableOpacity
          style={s.cameraBtn}
          onPress={() => setCameraOpen(true)}
          activeOpacity={0.8}
        >
          <Camera size={22} color="white" />
          <Text style={s.cameraBtnText}>Quick Capture</Text>
        </TouchableOpacity>

        {/* Gallery shortcut */}
        {showGalleryBtn && onGalleryPress && (
          <TouchableOpacity
            style={s.galleryBtn}
            onPress={onGalleryPress}
            activeOpacity={0.8}
          >
            <Images size={20} color={COLORS.brand.primary} />
            <Text style={s.galleryBtnText}>My Photos</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Full-screen camera modal */}
      <Modal
        visible={cameraOpen}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setCameraOpen(false)}
      >
        <CaptureCamera
          taskId={null}
          photoType="GENERAL"
          onCapture={handleCapture}
          onClose={() => setCameraOpen(false)}
        />
      </Modal>
    </>
  )
}

const s = StyleSheet.create({
  container:      { flexDirection: 'row', gap: 10 },
  cameraBtn:      {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
    backgroundColor: COLORS.brand.primary,
    paddingVertical: 14,
    borderRadius:    14,
  },
  cameraBtnText:  { color: 'white', fontSize: 14, fontWeight: '700' },
  galleryBtn:     {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             6,
    backgroundColor: COLORS.brand.tint,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius:    14,
    borderWidth:     1.5,
    borderColor:     COLORS.brand.primary,
  },
  galleryBtnText: { color: COLORS.brand.primary, fontSize: 13, fontWeight: '700' },
})
