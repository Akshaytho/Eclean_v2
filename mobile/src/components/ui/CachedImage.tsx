/**
 * CachedImage — drop-in replacement for React Native Image.
 * Uses expo-image under the hood for automatic disk + memory caching.
 *
 * Benefits on budget phones:
 * - Photos load from disk cache on revisit (0ms vs 5-30s on 3G)
 * - Memory-efficient: expo-image uses native image decoding
 * - Blur placeholder while loading (no blank white box)
 * - Automatic format negotiation (WebP on Android = 30% smaller)
 *
 * Usage: same as <Image> but with optional `placeholder` prop
 *   <CachedImage source={{ uri: 'https://...' }} style={s.photo} />
 */

import React from 'react'
import { Image as ExpoImage } from 'expo-image'
import type { ImageStyle, StyleProp } from 'react-native'

interface CachedImageProps {
  source: { uri: string } | number
  style?: StyleProp<ImageStyle>
  contentFit?: 'cover' | 'contain' | 'fill' | 'none'
  placeholder?: string | null // blurhash or thumbhash
  transition?: number // fade-in duration in ms
}

// expo-image caches aggressively by default:
// - Memory cache: LRU, ~100MB
// - Disk cache: LRU, ~500MB, survives app restart
const CACHE_POLICY = 'disk' as const

export const CachedImage = React.memo(function CachedImage({
  source,
  style,
  contentFit = 'cover',
  placeholder,
  transition = 200,
}: CachedImageProps) {
  return (
    <ExpoImage
      source={source}
      style={style}
      contentFit={contentFit}
      cachePolicy={CACHE_POLICY}
      placeholder={placeholder ? { blurhash: placeholder } : undefined}
      transition={transition}
      recyclingKey={typeof source === 'object' ? source.uri : undefined}
    />
  )
})
