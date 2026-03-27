module.exports = {
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestCameraPermissionsAsync:       jest.fn().mockResolvedValue({ granted: true }),
  launchCameraAsync:       jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
}
