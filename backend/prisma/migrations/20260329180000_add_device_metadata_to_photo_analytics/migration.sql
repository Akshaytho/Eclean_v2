-- Add device-captured metadata columns to analytics_photo_meta
-- These supplement EXIF data which gets stripped by mobile image compression
-- Device metadata from expo-location/expo-device is more reliable

ALTER TABLE "analytics_photo_meta" ADD COLUMN "capturedLat" DOUBLE PRECISION;
ALTER TABLE "analytics_photo_meta" ADD COLUMN "capturedLng" DOUBLE PRECISION;
ALTER TABLE "analytics_photo_meta" ADD COLUMN "capturedAt" TIMESTAMP(3);
ALTER TABLE "analytics_photo_meta" ADD COLUMN "capturedDeviceId" TEXT;
ALTER TABLE "analytics_photo_meta" ADD COLUMN "photoHash" TEXT;
