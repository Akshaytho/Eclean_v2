// Mock expo-constants so config.ts computes API_URL from the fallback
export default {
  expoConfig: {
    extra: { apiUrl: undefined },
  },
}
