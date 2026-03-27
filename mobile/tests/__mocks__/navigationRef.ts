// Stub navigation ref — prevents "cannot navigate" errors when client.ts
// tries to redirect to Auth on token refresh failure
export const navigationRef = {
  current: {
    reset: jest.fn(),
    navigate: jest.fn(),
  },
}
