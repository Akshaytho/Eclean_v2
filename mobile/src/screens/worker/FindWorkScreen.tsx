import React, { useRef, useState, useCallback, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator,
} from 'react-native'
import MapView, { Marker, Circle } from 'react-native-maps'
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import * as Location from 'expo-location'
import { MapPin, Filter } from 'lucide-react-native'

import { COLORS } from '../../constants/colors'
import { WORKER_THEME as W } from '../../constants/workerTheme'
import { DIRTY_LEVELS, TASK_CATEGORIES } from '../../constants/taskCategories'
import { workerTasksApi } from '../../api/tasks.api'
import { formatMoney } from '../../utils/formatMoney'
import { useLocationStore } from '../../stores/locationStore'
import type { Task, TaskCategory, DirtyLevel } from '../../types'
import type { WorkerStackParamList } from '../../navigation/types'

type Nav = NativeStackNavigationProp<WorkerStackParamList>

const SNAP_POINTS = ['20%', '50%', '90%']
const RADIUS_KM   = 10

const DIRTY_COLOR: Record<DirtyLevel, string> = {
  LIGHT:    COLORS.dirty.light,
  MEDIUM:   COLORS.dirty.medium,
  HEAVY:    COLORS.dirty.heavy,
  CRITICAL: COLORS.dirty.critical,
}

export function FindWorkScreen() {
  const navigation         = useNavigation<Nav>()
  const bottomSheetRef     = useRef<BottomSheet>(null)
  const mapRef             = useRef<MapView>(null)
  const { currentLocation, setLocation, setPermission } = useLocationStore()

  const [selectedCategory, setSelectedCategory] = useState<TaskCategory | null>(null)
  const [selectedDirty,    setSelectedDirty]    = useState<DirtyLevel | null>(null)
  const [selectedTaskId,   setSelectedTaskId]   = useState<string | null>(null)

  // ── Get initial location ──────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync()
      if (!granted) return
      setPermission(granted, false)
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const { latitude: lat, longitude: lng, accuracy } = loc.coords
      setLocation({ lat, lng, accuracy: accuracy ?? undefined, timestamp: Date.now() })
      mapRef.current?.animateToRegion({
        latitude:       lat,
        longitude:      lng,
        latitudeDelta:  0.05,
        longitudeDelta: 0.05,
      })
    })()
  }, [])

  // ── Query open tasks ──────────────────────────────────────────────────────
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['worker', 'tasks', 'open', currentLocation?.lat, currentLocation?.lng, selectedCategory, selectedDirty],
    queryFn: () =>
      workerTasksApi.getOpen({
        lat:       currentLocation?.lat,
        lng:       currentLocation?.lng,
        radiusKm:  RADIUS_KM,
        category:  selectedCategory ?? undefined,
        limit:     50,
      }),
    staleTime: 30_000,
  })

  const tasks = data?.tasks ?? []

  // Tasks with valid location (for map markers)
  const mappableTasks = tasks.filter((t) => t.locationLat != null && t.locationLng != null)

  const handleMarkerPress = useCallback((taskId: string) => {
    setSelectedTaskId(taskId)
    bottomSheetRef.current?.snapToIndex(1)
  }, [])

  const handleTaskPress = useCallback((taskId: string) => {
    navigation.navigate('TaskDetail', { taskId })
  }, [navigation])

  const defaultRegion = {
    latitude:       currentLocation?.lat  ?? 12.9716,
    longitude:      currentLocation?.lng  ?? 77.5946,
    latitudeDelta:  0.05,
    longitudeDelta: 0.05,
  }

  return (
    <View style={styles.container}>
      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={defaultRegion}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {/* Search radius circle */}
        {currentLocation && (
          <Circle
            center={{ latitude: currentLocation.lat, longitude: currentLocation.lng }}
            radius={RADIUS_KM * 1000}
            strokeColor={`${W.primary}50`}
            fillColor={`${W.primary}12`}
          />
        )}

        {/* Task markers */}
        {mappableTasks.map((task) => (
          <Marker
            key={task.id}
            coordinate={{ latitude: task.locationLat!, longitude: task.locationLng! }}
            onPress={() => handleMarkerPress(task.id)}
            pinColor={DIRTY_COLOR[task.dirtyLevel]}
          />
        ))}
      </MapView>

      {/* ── Bottom Sheet ─────────────────────────────────────────────────── */}
      <BottomSheet
        ref={bottomSheetRef}
        index={0}
        snapPoints={SNAP_POINTS}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handle}
      >
        {/* Filter chips */}
        <View style={styles.filterRow}>
          <Filter size={16} color={W.text.secondary} />
          {(Object.keys(DIRTY_LEVELS) as DirtyLevel[]).map((level) => (
            <TouchableOpacity
              key={level}
              style={[
                styles.chip,
                selectedDirty === level && { backgroundColor: DIRTY_COLOR[level] },
              ]}
              onPress={() => setSelectedDirty((prev) => prev === level ? null : level)}
            >
              <Text style={[
                styles.chipText,
                selectedDirty === level && { color: '#fff' },
              ]}>
                {DIRTY_LEVELS[level].label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.countRow}>
          <Text style={styles.countText}>
            {isLoading ? 'Loading…' : `${tasks.length} tasks nearby`}
          </Text>
          <TouchableOpacity onPress={() => refetch()}>
            <Text style={styles.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator color={W.primary} style={{ marginTop: 32 }} />
        ) : (
          <BottomSheetScrollView contentContainerStyle={styles.list}>
            {tasks.length === 0 ? (
              <View style={styles.empty}>
                <MapPin size={40} color={W.text.muted} />
                <Text style={styles.emptyText}>No tasks found nearby</Text>
                <Text style={styles.emptySubtext}>Try increasing the radius or changing filters</Text>
              </View>
            ) : (
              tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  selected={selectedTaskId === task.id}
                  onPress={() => handleTaskPress(task.id)}
                />
              ))
            )}
          </BottomSheetScrollView>
        )}
      </BottomSheet>
    </View>
  )
}

function TaskCard({
  task, selected, onPress,
}: { task: Task; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.taskCard, selected && styles.taskCardSelected]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <View style={styles.taskCardTop}>
        <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
        <Text style={styles.taskRate}>{formatMoney(task.rateCents, 'INR')}</Text>
      </View>
      <View style={styles.taskCardBottom}>
        <View style={[styles.levelBadge, { backgroundColor: DIRTY_COLOR[task.dirtyLevel] }]}>
          <Text style={styles.levelText}>{task.dirtyLevel}</Text>
        </View>
        <Text style={styles.taskCategory}>
          {TASK_CATEGORIES[task.category as keyof typeof TASK_CATEGORIES]?.label ?? task.category}
        </Text>
        {task.locationAddress ? (
          <Text style={styles.taskAddress} numberOfLines={1}>{task.locationAddress}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container:        { flex: 1 },
  sheetBg:          { backgroundColor: W.surface, borderRadius: 20 },
  handle:           { backgroundColor: W.text.muted, width: 40 },
  filterRow:        {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexWrap: 'wrap',
  },
  chip:             {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: W.primaryTint,
    borderWidth: 1,
    borderColor: W.border,
  },
  chipText:         { fontSize: 12, fontWeight: '600', color: W.text.secondary },
  countRow:         {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  countText:        { fontSize: 13, color: W.text.secondary },
  refreshText:      { fontSize: 13, color: W.primary, fontWeight: '600' },
  list:             { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  empty:            { alignItems: 'center', paddingTop: 32, gap: 8 },
  emptyText:        { fontSize: 15, fontWeight: '600', color: W.text.secondary },
  emptySubtext:     { fontSize: 13, color: W.text.muted, textAlign: 'center' },
  taskCard:         {
    backgroundColor: W.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: W.border,
  },
  taskCardSelected: { borderColor: W.primary, borderWidth: 2 },
  taskCardTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  taskTitle:        { flex: 1, fontSize: 14, fontWeight: '600', color: W.text.primary, marginRight: 8 },
  taskRate:         { fontSize: 16, fontWeight: '700', color: W.primary },
  taskCardBottom:   { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  levelBadge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  levelText:        { fontSize: 10, fontWeight: '700', color: '#fff' },
  taskCategory:     { fontSize: 12, color: W.text.secondary },
  taskAddress:      { fontSize: 11, color: W.text.muted, flex: 1 },
})
