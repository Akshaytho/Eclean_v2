import { v2 as cloudinary } from 'cloudinary'
import { env } from '../config/env'
import { InternalError } from './errors'

if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
  // Defer to call time — server boots without keys, upload endpoint returns 500 with clear message
}

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key:    env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure:     true, // Rule 11: Always HTTPS
})

export function assertCloudinaryConfigured(): void {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new InternalError('Cloudinary credentials are not configured (set CLOUDINARY_* in .env)')
  }
}

export { cloudinary }
