/**
 * Photo Similarity — Server-side before/after image comparison
 *
 * Uses perceptual hashing (pHash) to detect if before/after images
 * are essentially the same (worker did nothing, just waited and re-photographed).
 *
 * HOW IT WORKS:
 *   1. Download before + after images from Cloudinary (resized to 64px for speed)
 *   2. Convert to grayscale → compute DCT-based perceptual hash (64-bit)
 *   3. Hamming distance between hashes = similarity score
 *   4. Distance < 10 = images are >85% identical → flag as suspicious
 *
 * COST: ₹0, ~50ms per pair. Runs BEFORE AI call to save ₹1.5 on obvious fakes.
 *
 * WHY NOT SHA-256? SHA-256 detects exact byte matches (already in duplicate_image_check).
 * pHash detects VISUAL similarity — same scene with slightly different angle/lighting.
 */

import sharp from 'sharp'
import { logger } from '../../lib/logger'

// ─── Perceptual Hash (DCT-based, 64-bit) ──────────────────────────────────

const HASH_SIZE = 8 // 8x8 = 64-bit hash

/**
 * Compute perceptual hash of an image from URL.
 * Downloads at 64x64 grayscale for speed.
 */
async function computePHash(imageUrl: string): Promise<bigint | null> {
  try {
    // Use Cloudinary transform for fast 64px download (~2KB per image)
    const smallUrl = imageUrl.includes('/upload/')
      ? imageUrl.replace('/upload/', `/upload/w_${HASH_SIZE * 4},h_${HASH_SIZE * 4},c_fill,e_grayscale/`)
      : imageUrl

    const response = await fetch(smallUrl, { signal: AbortSignal.timeout(10000) })
    if (!response.ok) return null

    const buffer = Buffer.from(await response.arrayBuffer())

    // Resize to 8x8 grayscale, get raw pixel data
    const pixels = await sharp(buffer)
      .resize(HASH_SIZE, HASH_SIZE, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer()

    // Compute mean pixel value
    let sum = 0
    for (let i = 0; i < pixels.length; i++) sum += pixels[i]
    const mean = sum / pixels.length

    // Build 64-bit hash: 1 if pixel > mean, 0 otherwise
    let hash = 0n
    for (let i = 0; i < pixels.length; i++) {
      if (pixels[i] > mean) hash |= 1n << BigInt(i)
    }

    return hash
  } catch (err) {
    logger.warn({ imageUrl: imageUrl.slice(0, 80), err }, 'pHash computation failed — skipping')
    return null
  }
}

/**
 * Hamming distance between two 64-bit hashes.
 * Lower = more similar. 0 = identical. 64 = completely different.
 */
function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b
  let count = 0
  while (xor > 0n) {
    count += Number(xor & 1n)
    xor >>= 1n
  }
  return count
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface PhotoSimilarityResult {
  /** Average similarity across all pairs (0-100, higher = more similar) */
  avgSimilarity: number
  /** Number of pairs that are >85% similar (suspicious) */
  suspiciousPairs: number
  /** Total pairs checked */
  totalPairs: number
  /** Per-pair details */
  pairs: Array<{ pointIndex: number; similarity: number; suspicious: boolean }>
  /** True if enough pairs are suspicious to skip AI */
  shouldReject: boolean
}

/**
 * Compare before/after image pairs for visual similarity.
 * If images are too similar, worker likely didn't do any work.
 *
 * @param pairs Array of { beforeUrl, afterUrl, pointIndex }
 * @returns Similarity analysis result
 */
export async function checkPhotoSimilarity(
  pairs: Array<{ beforeUrl: string; afterUrl: string; pointIndex: number }>,
): Promise<PhotoSimilarityResult> {
  const results: PhotoSimilarityResult['pairs'] = []

  // Process all pairs in parallel for speed
  await Promise.all(
    pairs.map(async ({ beforeUrl, afterUrl, pointIndex }) => {
      const [beforeHash, afterHash] = await Promise.all([
        computePHash(beforeUrl),
        computePHash(afterUrl),
      ])

      if (beforeHash === null || afterHash === null) {
        // Can't compute — skip this pair (don't penalize for network issues)
        return
      }

      const distance = hammingDistance(beforeHash, afterHash)
      // Convert hamming distance (0-64) to similarity percentage (0-100)
      const similarity = Math.round((1 - distance / 64) * 100)
      const suspicious = similarity >= 85 // >85% similar = basically same image

      results.push({ pointIndex, similarity, suspicious })
    }),
  )

  if (results.length === 0) {
    return { avgSimilarity: 0, suspiciousPairs: 0, totalPairs: 0, pairs: [], shouldReject: false }
  }

  const avgSimilarity = Math.round(results.reduce((s, r) => s + r.similarity, 0) / results.length)
  const suspiciousPairs = results.filter((r) => r.suspicious).length

  // Reject if majority of pairs are suspicious (>= 50% of pairs)
  const shouldReject = suspiciousPairs >= Math.ceil(results.length / 2)

  return {
    avgSimilarity,
    suspiciousPairs,
    totalPairs: results.length,
    pairs: results.sort((a, b) => a.pointIndex - b.pointIndex),
    shouldReject,
  }
}
