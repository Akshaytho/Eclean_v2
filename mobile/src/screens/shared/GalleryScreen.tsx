/**
 * GalleryScreen — eClean's built-in photo gallery.
 *
 * PERFORMANCE DESIGN:
 * - Shows thumbnails ONLY in the grid (5-15KB each, loads instantly)
 * - Full-res loaded only when photo is tapped for detail view
 * - FlatList with numColumns=3 and getItemLayout (no layout calculation per item)
 * - Photos organized: task photos grouped, general photos at bottom
 * - Upload status shown on each thumbnail (green tick = uploaded, orange dot = pending)
 *
 * Each photo shows:
 * - Thumbnail (200x200px)
 * - Upload status indicator
 * - Photo type badge (BEFORE/AFTER/PROOF/GENERAL)
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Dimensions, Image, Modal, ActivityIndicator, RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, X, Check, Clock, Trash2, Upload } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import { COLORS } from '../../constants/colors'
import { getAllPhotos, deletePhoto, getGalleryStats, GalleryPhoto } from '../../services/galleryService'
import { EmptyState } from '../../components/ui/EmptyState'
import { ScreenWrapper } from '../../components/layout/ScreenWrapper'

const { width: SW } = Dimensions.get('window')
const THUMB_SIZE    = (SW - 4) / 3  // 3 columns, 2px gap each side

const TYPE_COLORS: Record<string, string> = {
  BEFORE:  '#F59E0B',
  AFTER:   '#2E8B57',
  PROOF:   '#3B82F6',
  GENERAL: '#8B5CF6',
}

export function GalleryScreen() {
  const navigation                = useNavigation()
  const insets                    = useSafeAreaInsets()
  const [photos,    setPhotos]    = useState<GalleryPhoto[]>([])
  const [loading,   setLoading]   = useState(true)
  const [refreshing,setRefreshing]= useState(false)
  const [selected,  setSelected]  = useState<GalleryPhoto | null>(null)
  const [stats,     setStats]     = useState({ count: 0, sizeMB: 0 })

  const load = useCallback(async () => {
    const [all, s] = await Promise.all([getAllPhotos(), getGalleryStats()])
    setPhotos(all)
    setStats(s)
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const onDelete = useCallback(async (photo: GalleryPhoto) => {
    await deletePhoto(photo)
    setSelected(null)
    void load()
  }, [load])

  // FlatList item renderer — uses thumbnails only
  const renderItem = useCallback(({ item }: { item: GalleryPhoto }) => (
    <TouchableOpacity
      style={s.thumb}
      onPress={() => setSelected(item)}
      activeOpacity={0.85}
    >
      <Image
        source={{ uri: item.thumbUri }}
        style={s.thumbImg}
        resizeMode="cover"
      />
      {/* Photo type badge */}
      <View style={[s.typeDot, { backgroundColor: TYPE_COLORS[item.photoType] ?? COLORS.neutral[400] }]}>
        <Text style={s.typeDotText}>{item.photoType[0]}</Text>
      </View>
      {/* Upload status */}
      <View style={[s.uploadDot, { backgroundColor: item.uploaded ? '#2E8B57' : '#F59E0B' }]}>
        {item.uploaded
          ? <Check size={8} color="white" strokeWidth={3} />
          : <Clock size={8} color="white" />
        }
      </View>
    </TouchableOpacity>
  ), [])

  // getItemLayout = FlatList can skip layout calculation (faster scroll)
  const getItemLayout = useCallback((_: any, index: number) => ({
    length: THUMB_SIZE,
    offset: THUMB_SIZE * Math.floor(index / 3),
    index,
  }), [])

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={s.center}><ActivityIndicator color={COLORS.brand.primary} size="large" /></View>
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top }]}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <ArrowLeft size={22} color={COLORS.neutral[900]} />
          </TouchableOpacity>
          <View>
            <Text style={s.title}>My Photos</Text>
            <Text style={s.stats}>{stats.count} photos  •  {stats.sizeMB} MB</Text>
          </View>
        </View>
      </View>

      {photos.length === 0 ? (
        <EmptyState
          emoji="📷"
          title="No photos yet"
          subtitle="Photos you capture during tasks will appear here"
        />
      ) : (
        <FlatList
          data={photos}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          numColumns={3}
          getItemLayout={getItemLayout}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void load() }}
              tintColor={COLORS.brand.primary}
            />
          }
          contentContainerStyle={s.grid}
          showsVerticalScrollIndicator={false}
          initialNumToRender={18}
          maxToRenderPerBatch={9}
          windowSize={5}
        />
      )}

      {/* Detail modal — full-res loaded ONLY when opened */}
      <Modal
        visible={!!selected}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSelected(null)}
      >
        {selected && (
          <View style={s.modal}>
            <Image source={{ uri: selected.fullUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            <View style={[s.modalTop, { paddingTop: insets.top + 12 }]}>
              <TouchableOpacity onPress={() => setSelected(null)} style={s.modalBtn}>
                <X size={22} color="white" />
              </TouchableOpacity>
              <View style={[s.modalBadge, { backgroundColor: TYPE_COLORS[selected.photoType] }]}>
                <Text style={s.modalBadgeText}>{selected.photoType}</Text>
              </View>
              <TouchableOpacity onPress={() => void onDelete(selected)} style={s.modalBtn}>
                <Trash2 size={22} color="#FCA5A5" />
              </TouchableOpacity>
            </View>
            <View style={[s.modalBottom, { paddingBottom: insets.bottom + 16 }]}>
              <Text style={s.modalMeta}>
                {new Date(selected.capturedAt).toLocaleString('en-IN')}
              </Text>
              {selected.metadata.lat && (
                <Text style={s.modalMeta}>
                  GPS: {selected.metadata.lat.toFixed(5)}, {selected.metadata.lng?.toFixed(5)}
                </Text>
              )}
              <View style={[s.uploadStatus, { backgroundColor: selected.uploaded ? '#065F46' : '#92400E' }]}>
                {selected.uploaded
                  ? <><Check size={12} color="white" /><Text style={s.uploadText}>Uploaded to server</Text></>
                  : <><Upload size={12} color="white" /><Text style={s.uploadText}>Not yet uploaded</Text></>
                }
              </View>
            </View>
          </View>
        )}
      </Modal>
    </ScreenWrapper>
  )
}

const s = StyleSheet.create({
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:       { paddingHorizontal: 20, paddingBottom: 12, backgroundColor: COLORS.surface },
  headerRow:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title:        { fontSize: 22, fontWeight: '800', color: COLORS.neutral[900] },
  stats:        { fontSize: 12, color: COLORS.neutral[400], marginTop: 2 },
  grid:         { padding: 1 },
  thumb:        { width: THUMB_SIZE, height: THUMB_SIZE, margin: 1 },
  thumbImg:     { width: '100%', height: '100%' },
  typeDot:      { position: 'absolute', top: 6, left: 6, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  typeDotText:  { color: 'white', fontSize: 9, fontWeight: '800' },
  uploadDot:    { position: 'absolute', bottom: 6, right: 6, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  modal:        { flex: 1, backgroundColor: '#000' },
  modalTop:     { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 },
  modalBtn:     { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  modalBadge:   { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  modalBadgeText:{ color: 'white', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  modalBottom:  { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', padding: 16, zIndex: 10 },
  modalMeta:    { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 4 },
  uploadStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start', marginTop: 8 },
  uploadText:   { color: 'white', fontSize: 11, fontWeight: '600' },
})
