import React from 'react'
import { Polygon, Marker } from 'react-native-maps'
import { COLORS } from '../../constants/colors'
import { DirtyLevel } from '../../types'

const DIRTY_COLORS: Record<DirtyLevel, { fill: string; stroke: string }> = {
  LIGHT:    { fill: 'rgba(46,139,87,0.15)',  stroke: COLORS.dirty.light },
  MEDIUM:   { fill: 'rgba(245,158,11,0.20)', stroke: COLORS.dirty.medium },
  HEAVY:    { fill: 'rgba(239,68,68,0.25)',  stroke: COLORS.dirty.heavy },
  CRITICAL: { fill: 'rgba(153,27,27,0.30)',  stroke: COLORS.dirty.critical },
}

interface Coordinate {
  latitude:  number
  longitude: number
}

interface Zone {
  id:          string
  name:        string
  dirtyLevel:  DirtyLevel
  coordinates: Coordinate[]
  centroid?:   Coordinate
}

interface ZoneOverlayProps {
  zone:      Zone
  onPress?:  (zone: Zone) => void
  selected?: boolean
}

export function ZoneOverlay({ zone, onPress, selected = false }: ZoneOverlayProps) {
  const colors = DIRTY_COLORS[zone.dirtyLevel]

  if (!zone.coordinates || zone.coordinates.length < 3) return null

  return (
    <>
      <Polygon
        coordinates={zone.coordinates}
        fillColor={selected ? colors.fill.replace('0.', '0.4') : colors.fill}
        strokeColor={colors.stroke}
        strokeWidth={selected ? 3 : 1.5}
        tappable
        onPress={() => onPress?.(zone)}
      />
      {zone.centroid && (
        <Marker
          coordinate={zone.centroid}
          anchor={{ x: 0.5, y: 0.5 }}
          onPress={() => onPress?.(zone)}
          tracksViewChanges={false}
        />
      )}
    </>
  )
}
