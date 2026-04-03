/**
 * FindWorkScreen — "Uber driver nearby rides"
 *
 * Map pins show ₹AMOUNT (not just dots)
 * Pin color = dirty level (green/orange/red)
 * Empty state with "Expand to 10km" + notification opt-in
 * Bottom sheet with cleaner task cards
 */

import React, { useRef, useState, useCallback, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Platform,
} from 'react-native'
// TODO: Replace with MapContainer wrapper when built (Sprint 4)
import MapView, { Marker, Circle } from 'react-native-maps'
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import * as Location from 'expo-location'
import { MapPin, Filter, Bell, Search } from 'lucide-react-native'

import { COLORS } from '../../constants/colors'
import { WORKER_THEME as W } from '../../constants/workerTheme'
import { DIRTY_LEVELS } from '../../constants/taskCategories'
import { workerTasksApi } from '../../api/tasks.api'
import { formatMoney } from '../../utils/formatMoney'
import { formatTimeShort } from '../../utils/formatTime'
import { DEFAULT_MAP_REGION } from '../../constants/config'
import { useLocationStore } from '../../stores/locationStore'
import { Skeleton } from '../../components/ui/Skeleton'
import type { Task, DirtyLevel } from '../../types'
import type { WorkerStackParamList } from '../../navigation/types'

type Nav = NativeStackNavigationProp<WorkerStackParamList>

const SNAP_POINTS = ['25%', '55%', '90%']

const DIRTY_COLOR: Record<DirtyLevel, string> = {
  LIGHT:    COLORS.dirty.light,
  MEDIUM:   COLORS.dirty.medium,
  HEAVY:    COLORS.dirty.heavy,
  CRITICAL: COLORS.dirty.critical,
}

export function FindWorkScreen() {
  const navigation     = useNavigation<Nav>()
  const bottomSheetRef = useRef<BottomSheet>(null)
  const mapRef         = useRef<MapView>(null)
  const { currentLocation, setLocation, setPermission } = useLocationStore()

  const [selectedDirty, setSelectedDirty] = useState<DirtyLevel | null>(null)
  const [radiusKm, setRadiusKm]          = useState(5)

  // Get location on mount
  const [locationDenied, setLocationDenied] = useState(false)
  useEffect(() => {
    ;(async () => {
      try {
        const { granted } = await Location.requestForegroundPermissionsAsync()
        if (!granted) { setLocationDenied(true); return }
        setPermission(granted, false)
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        const { latitude: lat, longitude: lng, accuracy } = loc.coords
        setLocation({ lat, lng, accuracy: accuracy ?? undefined, timestamp: Date.now() })
        mapRef.current?.animateToRegion({
          latitude: lat, longitude: lng,
          latitudeDelta: 0.04, longitudeDelta: 0.04,
        })
      } catch (err) {
        console.warn('[FindWork] Location request failed:', err)
        setLocationDenied(true)
      }
    })()
  }, [])

  // Query open tasks
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['worker', 'tasks', 'open', currentLocation?.lat, currentLocation?.lng, radiusKm],
    queryFn: () =>
      workerTasksApi.getOpen({
        lat:      currentLocation?.lat,
        lng:      currentLocation?.lng,
        radiusKm: currentLocation ? radiusKm : undefined,
        limit:    50,
      }),
    enabled: !!currentLocation, // Don't query without GPS — would fetch ALL tasks globally
    staleTime: 30_000,
  })

  const allTasks = data?.tasks ?? []
  const tasks = selectedDirty ? allTasks.filter(t => t.dirtyLevel === selectedDirty) : allTasks
  const mappableTasks = tasks.filter(t => t.locationLat != null)

  const handleTaskPress = useCallback((taskId: string) => {
    navigation.navigate('TaskDetail', { taskId })
  }, [navigation])

  const defaultRegion = currentLocation
    ? { latitude: currentLocation.lat, longitude: currentLocation.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 }
    : DEFAULT_MAP_REGION

  return (
    <View style={s.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={defaultRegion}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {currentLocation && (
          <Circle
            center={{ latitude: currentLocation.lat, longitude: currentLocation.lng }}
            radius={radiusKm * 1000}
            strokeColor={`${W.primary}40`}
            fillColor={`${W.primary}08`}
          />
        )}

        {/* Price pins — custom view on iOS, title fallback on Android */}
        {mappableTasks.map((task) => (
          <Marker
            key={task.id}
            coordinate={{ latitude: task.locationLat!, longitude: task.locationLng! }}
            onPress={() => handleTaskPress(task.id)}
            title={Platform.OS === 'android' ? `\u20B9${Math.round(task.rateCents / 100)}` : undefined}
            pinColor={Platform.OS === 'android' ? DIRTY_COLOR[task.dirtyLevel] : undefined}
          >
            {Platform.OS === 'ios' && (
              <PricePin amount={task.rateCents} dirtyLevel={task.dirtyLevel} />
            )}
          </Marker>
        ))}
      </MapView>

      {/* Bottom Sheet */}
      <BottomSheet
        ref={bottomSheetRef}
        index={0}
        snapPoints={SNAP_POINTS}
        backgroundStyle={s.sheetBg}
        handleIndicatorStyle={s.handle}
      >
        {/* Filter chips */}
        <View style={s.filterRow}>
          <Filter size={14} color={W.text.muted} />
          {(Object.keys(DIRTY_LEVELS) as DirtyLevel[]).map((level) => (
            <TouchableOpacity
              key={level}
              style={[s.chip, selectedDirty === level && { backgroundColor: DIRTY_COLOR[level], borderColor: DIRTY_COLOR[level] }]}
              onPress={() => setSelectedDirty(prev => prev === level ? null : level)}
            >
              <Text style={[s.chipText, selectedDirty === level && { color: '#fff' }]}>
                {DIRTY_LEVELS[level].label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Count + radius */}
        <View style={s.countRow}>
          <Text style={s.countText}>
            {isLoading ? 'Searching...' : `${tasks.length} tasks within ${radiusKm} km`}
          </Text>
          <TouchableOpacity onPress={() => refetch()}>
            <Text style={s.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {locationDenied ? (
          <View style={s.empty}>
            <MapPin size={40} color={W.text.muted} />
            <Text style={s.emptyTitle}>Location access needed</Text>
            <Text style={s.emptySubtext}>
              Enable location permissions in your phone settings to find nearby tasks.
            </Text>
          </View>
        ) : isLoading ? (
          <View style={s.skeletonList}>
            {[1, 2, 3].map(i => <Skeleton key={i} width="100%" height={80} borderRadius={12} />)}
          </View>
        ) : tasks.length === 0 ? (
          /* Empty state — NOT a dead end */
          <View style={s.empty}>
            <Search size={40} color={W.text.muted} />
            <Text style={s.emptyTitle}>No tasks in {radiusKm} km</Text>

            {radiusKm < 10 && (
              <TouchableOpacity
                style={s.expandBtn}
                onPress={() => setRadiusKm(10)}
                activeOpacity={0.85}
              >
                <Text style={s.expandBtnText}>Expand to 10 km</Text>
              </TouchableOpacity>
            )}

            {radiusKm >= 10 && (
              <Text style={s.emptySubtext}>
                No tasks available right now.{'\n'}We'll notify you when work appears nearby.
              </Text>
            )}

            <TouchableOpacity style={s.notifyBtn} activeOpacity={0.85}>
              <Bell size={16} color={W.primary} />
              <Text style={s.notifyBtnText}>Notify me when tasks appear</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <BottomSheetScrollView contentContainerStyle={s.list}>
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} onPress={() => handleTaskPress(task.id)} />
            ))}
          </BottomSheetScrollView>
        )}
      </BottomSheet>
    </View>
  )
}

// ── Price Pin (₹ amount on map) ─────────────────────────────────────────────

function PricePin({ amount, dirtyLevel }: { amount: number; dirtyLevel: DirtyLevel }) {
  const color = DIRTY_COLOR[dirtyLevel]
  const text = `\u20B9${Math.round(amount / 100)}`

  return (
    <View style={[pp.container, { backgroundColor: color }]}>
      <Text style={pp.text}>{text}</Text>
      <View style={[pp.arrow, { borderTopColor: color }]} />
    </View>
  )
}

const pp = StyleSheet.create({
  container: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignItems: 'center', minWidth: 44 },
  text:      { fontSize: 12, fontWeight: '800', color: '#fff' },
  arrow:     { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', marginTop: -1 },
})

// ── Task Card ───────────────────────────────────────────────────────────────

const TaskCard = React.memo(function TaskCard({ task, onPress }: { task: Task; onPress: () => void }) {
  const color = DIRTY_COLOR[task.dirtyLevel]

  return (
    <TouchableOpacity style={s.taskCard} onPress={onPress} activeOpacity={0.85}>
      <View style={s.taskRow1}>
        <Text style={s.taskTitle} numberOfLines={1}>{task.title}</Text>
        <Text style={s.taskRate}>{formatMoney(task.rateCents, 'INR')}</Text>
      </View>

      <View style={s.taskRow2}>
        {task.locationAddress && (
          <View style={s.taskMeta}>
            <MapPin size={12} color={W.text.muted} />
            <Text style={s.taskAddress} numberOfLines={1}>{task.locationAddress}</Text>
          </View>
        )}
      </View>

      <View style={s.taskRow3}>
        <View style={[s.dirtyBadge, { backgroundColor: color }]}>
          <Text style={s.dirtyText}>{task.dirtyLevel}</Text>
        </View>
        {(task.totalReferencePoints ?? 0) > 0 && (
          <Text style={s.taskPhotos}>{task.totalReferencePoints} photos</Text>
        )}
        {task.workWindowStart && (
          <Text style={s.taskWindow}>{formatTimeShort(task.workWindowStart)} - {formatTimeShort(task.workWindowEnd)}</Text>
        )}
      </View>
    </TouchableOpacity>
  )
})

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },
  sheetBg:   { backgroundColor: W.surface, borderRadius: 20 },
  handle:    { backgroundColor: W.text.muted, width: 40 },

  // Filters
  filterRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8, flexWrap: 'wrap' },
  chip:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: W.border, backgroundColor: W.surface },
  chipText:  { fontSize: 12, fontWeight: '600', color: W.text.secondary },

  // Count
  countRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  countText:   { fontSize: 13, color: W.text.secondary },
  refreshText: { fontSize: 13, color: W.primary, fontWeight: '600' },

  // List
  list:         { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  skeletonList: { paddingHorizontal: 16, gap: 10, paddingTop: 8 },

  // Empty state
  empty:        { alignItems: 'center', paddingTop: 32, paddingHorizontal: 32, gap: 12 },
  emptyTitle:   { fontSize: 16, fontWeight: '700', color: W.text.secondary },
  emptySubtext: { fontSize: 13, color: W.text.muted, textAlign: 'center', lineHeight: 20 },
  expandBtn:    { backgroundColor: W.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  expandBtnText:{ fontSize: 14, fontWeight: '700', color: '#fff' },
  notifyBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  notifyBtnText:{ fontSize: 13, fontWeight: '600', color: W.primary },

  // Task card
  taskCard:  { backgroundColor: W.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: W.border, gap: 8 },
  taskRow1:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  taskTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: W.text.primary, marginRight: 8 },
  taskRate:  { fontSize: 17, fontWeight: '800', color: W.primary },
  taskRow2:  { },
  taskMeta:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  taskAddress:{ fontSize: 12, color: W.text.muted, flex: 1 },
  taskRow3:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dirtyBadge:{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  dirtyText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  taskPhotos:{ fontSize: 11, color: W.text.muted },
  taskWindow:{ fontSize: 11, color: W.text.muted },
})
