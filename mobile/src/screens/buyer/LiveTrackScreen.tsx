// LiveTrackScreen — real-time map with worker GPS via socket
import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import MapView, { Marker, Polyline } from 'react-native-maps'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import { ChevronLeft, Navigation } from 'lucide-react-native'
import { COLORS } from '../../constants/colors'
import { useSocketStore } from '../../stores/socketStore'
import type { BuyerStackParamList } from '../../navigation/types'
import type { GPSCoord } from '../../types'

type Route = RouteProp<BuyerStackParamList, 'LiveTrack'>

export function LiveTrackScreen() {
  const navigation = useNavigation()
  const route      = useRoute<Route>()
  const { taskId } = route.params
  const { socket, joinTask, leaveTask } = useSocketStore()
  const [trail, setTrail] = useState<GPSCoord[]>([])
  const [last,  setLast]  = useState<GPSCoord | null>(null)

  useEffect(() => {
    joinTask(taskId)

    const handleLocation = (data: { lat: number; lng: number; accuracy?: number; timestamp: number }) => {
      const coord: GPSCoord = { ...data, timestamp: data.timestamp ?? Date.now() }
      setLast(coord)
      setTrail(t => [...t.slice(-200), coord]) // keep last 200 points
    }

    socket?.on('worker:location', handleLocation)
    return () => {
      socket?.off('worker:location', handleLocation)
      leaveTask(taskId)
    }
  }, [taskId, socket])

  const region = last ? {
    latitude:       last.lat,
    longitude:      last.lng,
    latitudeDelta:  0.008,
    longitudeDelta: 0.008,
  } : {
    latitude: 17.385, longitude: 78.4867, latitudeDelta: 0.05, longitudeDelta: 0.05,
  }

  return (
    <View style={s.root}>
      <MapView style={s.map} region={region} showsUserLocation>
        {last && (
          <Marker coordinate={{ latitude: last.lat, longitude: last.lng }} title="Worker">
          </Marker>
        )}
        {trail.length > 1 && (
          <Polyline
            coordinates={trail.map(p => ({ latitude: p.lat, longitude: p.lng }))}
            strokeColor={COLORS.brand.primary}
            strokeWidth={3}
          />
        )}
      </MapView>

      {/* Back button */}
      <TouchableOpacity style={s.back} onPress={() => navigation.goBack()}>
        <ChevronLeft size={22} color={COLORS.neutral[900]} />
      </TouchableOpacity>

      {/* Status pill */}
      <View style={s.pill}>
        <View style={[s.dot, { backgroundColor: last ? COLORS.brand.primary : COLORS.neutral[400] }]} />
        <Text style={s.pillText}>
          {last ? `Worker tracked · ${trail.length} points` : 'Waiting for worker location...'}
        </Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1 },
  map:  { flex: 1 },
  back: { position: 'absolute', top: 56, left: 16, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 20, padding: 8 },
  pill: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8, elevation: 4 },
  dot:  { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 13, fontWeight: '600', color: COLORS.neutral[800] },
})
