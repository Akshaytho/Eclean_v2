import React, { useEffect, useRef } from 'react'
import { Animated, View, StyleSheet } from 'react-native'
import { Marker } from 'react-native-maps'
import { COLORS } from '../../constants/colors'

interface WorkerLocationMarkerProps {
  latitude:  number
  longitude: number
  size?:     number
}

export function WorkerLocationMarker({ latitude, longitude, size = 20 }: WorkerLocationMarkerProps) {
  const pulse = useRef(new Animated.Value(1)).current
  const opacity = useRef(new Animated.Value(0.6)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulse,   { toValue: 2,   duration: 1200, useNativeDriver: true }),
          Animated.timing(pulse,   { toValue: 1,   duration: 0,    useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0,   duration: 1200, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 0,    useNativeDriver: true }),
        ]),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [pulse, opacity])

  return (
    <Marker
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}
    >
      <View style={[s.wrapper, { width: size * 3, height: size * 3 }]}>
        {/* Pulse ring */}
        <Animated.View
          style={[
            s.pulse,
            {
              width:          size * 2.5,
              height:         size * 2.5,
              borderRadius:   size * 1.25,
              borderColor:    COLORS.map.worker,
              opacity,
              transform:      [{ scale: pulse }],
            },
          ]}
        />
        {/* Core dot */}
        <View style={[s.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS.map.worker }]} />
        {/* White ring */}
        <View style={[s.ring, { width: size + 4, height: size + 4, borderRadius: (size + 4) / 2 }]} />
      </View>
    </Marker>
  )
}

const s = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center' },
  pulse:   { position: 'absolute', borderWidth: 2 },
  dot:     { position: 'absolute', zIndex: 2 },
  ring:    { position: 'absolute', borderWidth: 2, borderColor: '#fff', zIndex: 1 },
})
