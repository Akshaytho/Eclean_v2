/**
 * LiveTrackScreen
 * Backend connections:
 *   GET /api/v1/buyer/tasks/:taskId  — fetch task for worker name + startedAt
 *   Socket event: worker:location → { lat, lng, accuracy, timestamp }
 *   Socket: join_task_room on mount, leave on unmount
 *
 * Shows: full-screen map, GPS trail, worker info overlay, time on site counter
 */
import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import MapView, { Marker, Polyline, Circle } from 'react-native-maps'
import { useQuery } from '@tanstack/react-query'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import { ChevronLeft, MapPin, Clock, User } from 'lucide-react-native'
import { BUYER_THEME as B } from '../../constants/buyerTheme'
import { useSocketStore }  from '../../stores/socketStore'
import { buyerTasksApi }   from '../../api/tasks.api'
import type { BuyerStackParamList } from '../../navigation/types'
import type { GPSCoord } from '../../types'

type Route = RouteProp<BuyerStackParamList, 'LiveTrack'>

export function LiveTrackScreen() {
  const navigation    = useNavigation()
  const route         = useRoute<Route>()
  const { taskId }    = route.params
  const { socket, joinTask, leaveTask } = useSocketStore()
  const [trail, setTrail] = useState<GPSCoord[]>([])
  const [last,  setLast]  = useState<GPSCoord | null>(null)
  const [elapsed, setElapsed] = useState(0)  // seconds on site

  // Fetch task to get worker name and startedAt
  // Backend returns worker: { id, name, email } in the task detail
  const { data: task } = useQuery({
    queryKey: ['buyer-task', taskId],
    queryFn:  () => buyerTasksApi.getTask(taskId),
    staleTime: 30_000,
  })

  // Socket: join room + listen for GPS events
  useEffect(() => {
    joinTask(taskId)

    const handleLocation = (data: { lat: number; lng: number; accuracy?: number; timestamp?: number }) => {
      const coord: GPSCoord = { ...data, timestamp: data.timestamp ?? Date.now() }
      setLast(coord)
      setTrail(prev => [...prev.slice(-200), coord])
    }

    socket?.on('worker:location', handleLocation)
    return () => {
      socket?.off('worker:location', handleLocation)
      leaveTask(taskId)
    }
  }, [taskId, socket])

  // Time on site counter — computed from task.startedAt
  useEffect(() => {
    if (!task?.startedAt) return
    const startMs = new Date(task.startedAt).getTime()

    const tick = () => setElapsed(Math.floor((Date.now() - startMs) / 1000))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [task?.startedAt])

  const region = last
    ? { latitude: last.lat, longitude: last.lng, latitudeDelta: 0.006, longitudeDelta: 0.006 }
    : { latitude: 17.385, longitude: 78.4867, latitudeDelta: 0.05, longitudeDelta: 0.05 }

  const formatElapsed = (secs: number) => {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  return (
    <View style={styles.root}>
      {/* Full-screen map */}
      <MapView style={styles.map} region={region} showsUserLocation>
        {/* Task location pin */}
        {task?.locationLat && task?.locationLng && (
          <Marker
            coordinate={{ latitude: task.locationLat, longitude: task.locationLng }}
            title="Task Location"
            pinColor={B.primary}
          />
        )}

        {/* Worker current position — pulsing circle + marker */}
        {last && (
          <>
            <Circle
              center={{ latitude: last.lat, longitude: last.lng }}
              radius={30}
              fillColor={B.primary + '30'}
              strokeColor={B.primary}
              strokeWidth={2}
            />
            <Marker
              coordinate={{ latitude: last.lat, longitude: last.lng }}
              title="Worker"
            >
              <View style={styles.workerDot}>
                <View style={styles.workerDotInner} />
              </View>
            </Marker>
          </>
        )}

        {/* GPS trail polyline */}
        {trail.length > 1 && (
          <Polyline
            coordinates={trail.map(p => ({ latitude: p.lat, longitude: p.lng }))}
            strokeColor={B.primary}
            strokeWidth={3}
            lineDashPattern={[1]}
          />
        )}
      </MapView>

      {/* Back button */}
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <ChevronLeft size={22} color={B.text.primary} />
      </TouchableOpacity>

      {/* Worker info overlay at bottom */}
      <View style={styles.overlay}>
        {/* Worker name + status */}
        <View style={styles.workerRow}>
          <View style={styles.avatarBox}>
            <Text style={styles.avatarText}>
              {task?.worker?.name?.charAt(0) ?? '?'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.workerName}>
              {task?.worker?.name ?? 'Worker'}
            </Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: last ? '#16A34A' : B.text.muted }]} />
              <Text style={styles.statusText}>
                {last ? 'Live GPS active' : 'Waiting for location...'}
              </Text>
            </View>
          </View>
          {/* Time on site */}
          <View style={styles.timeBox}>
            <Clock size={12} color={B.text.secondary} />
            <Text style={styles.timeText}>{formatElapsed(elapsed)}</Text>
            <Text style={styles.timeLabel}>on site</Text>
          </View>
        </View>

        {/* GPS accuracy + trail info */}
        {last && (
          <View style={styles.gpsRow}>
            <MapPin size={12} color={B.text.muted} />
            <Text style={styles.gpsText}>
              {last.accuracy != null ? `±${Math.round(last.accuracy)}m accuracy` : 'GPS active'}
              {' · '}{trail.length} location{trail.length !== 1 ? 's' : ''} recorded
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root:          { flex: 1 },
  map:           { flex: 1 },
  back:          { position: 'absolute', top: 56, left: 16, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 22, padding: 10, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4 },

  // Custom worker marker
  workerDot:     { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: B.primary },
  workerDotInner:{ width: 12, height: 12, borderRadius: 6, backgroundColor: B.primary },

  // Bottom overlay
  overlay:       { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(255,255,255,0.97)', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12 },
  workerRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  avatarBox:     { width: 44, height: 44, borderRadius: 22, backgroundColor: B.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText:    { fontSize: 18, fontWeight: '700', color: '#fff' },
  workerName:    { fontSize: 16, fontWeight: '700', color: B.text.primary },
  statusRow:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  statusDot:     { width: 7, height: 7, borderRadius: 3.5 },
  statusText:    { fontSize: 12, color: B.text.secondary },
  timeBox:       { alignItems: 'center', gap: 2 },
  timeText:      { fontSize: 18, fontWeight: '800', color: B.text.primary },
  timeLabel:     { fontSize: 10, color: B.text.muted },
  gpsRow:        { flexDirection: 'row', alignItems: 'center', gap: 5 },
  gpsText:       { fontSize: 12, color: B.text.muted },
})
