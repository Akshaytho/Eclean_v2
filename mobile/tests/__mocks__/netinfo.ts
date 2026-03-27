// Always reports "connected" so offline-detection in client.ts doesn't interfere
export default {
  fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
  addEventListener: jest.fn(() => jest.fn()),
}
