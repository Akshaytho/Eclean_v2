# eClean — Architecture Decisions

> Permanent record of WHY choices were made. Never delete entries.

---

## D1: react-native-maps over @rnmapbox/maps
**Decided:** Sprint 0
**Reason:** Works with Expo managed workflow, no Mapbox token cost, Google Maps on Android (28,500 free loads/month), Apple Maps on iOS (unlimited free). Mapbox better for custom styling but costs money at scale.
**Revisit:** If custom map styles needed (Sprint 6+)

## D2: expo-secure-store for tokens, AsyncStorage for cache
**Decided:** Sprint 0
**Reason:** Tokens need hardware encryption (iOS Keychain, Android Keystore). Cache (react-query, offline queue) needs speed, not encryption. Never swap these.

## D3: Timer computed from task.startedAt (server), not local useState
**Decided:** Sprint 0
**Reason:** Local useState(0) resets on app restart. Server timestamp survives restart, reinstall, even device change.

## D4: GPS via socket.emit('worker:gps'), HTTP POST only as fallback
**Decided:** Sprint 0
**Reason:** Socket already rate-limits, validates, saves to DB, and broadcasts to buyer in real-time. HTTP adds latency and bypasses rate limiting.

## D5: Single role per user (no multi-role)
**Decided:** Sprint 0 (from Founder Blueprint)
**Reason:** Simpler UX, simpler navigation, simpler backend. Add multi-role in V2 via "Switch Role" button on Profile.

## D6: rateCents NOT sent from PostTaskScreen — backend auto-calculates
**Decided:** Sprint 3
**Reason:** Backend has minimum rate validation per dirty level (LIGHT:2000, MEDIUM:4000, HEAVY:8000, CRITICAL:12000). Frontend sending custom value caused 400 errors. Backend default is always correct.

## D7: Jest screen tests use node environment + full RN mock
**Decided:** Sprint 3 (testing session)
**Reason:** jest-expo@53 + RN 0.76 incompatibility (NativeModules.default undefined). Solution: node env + comprehensive react-native.ts mock. Component tests use separate jest.screens.config.js.

## D8: EAS Build for CI (not local Gradle)
**Decided:** Session 6 (CI setup)
**Reason:** Local expo prebuild + Gradle fails due to RN 0.76 generating enableBundleCompression in build.gradle. EAS handles all native build complexity correctly.

## D9: Maestro for E2E (not Detox)
**Decided:** Session 6
**Reason:** Maestro is YAML-based (simpler to write/maintain), doesn't require native test build, works with Expo Go, runs on GitHub Actions with Android emulator. Detox has much higher setup cost.

## D10: formatMoney accepts currency code (not hardcoded ₹)
**Decided:** Sprint 3
**Reason:** PDF blueprint explicitly requires this. Future multi-currency support (countryCode on zones → task.currency). Always call formatMoney(cents, task.currency ?? 'INR').
