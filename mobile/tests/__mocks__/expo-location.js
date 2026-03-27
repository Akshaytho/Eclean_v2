module.exports = {
  getForegroundPermissionsAsync:     jest.fn().mockResolvedValue({ status: 'granted' }),
  getBackgroundPermissionsAsync:     jest.fn().mockResolvedValue({ status: 'granted' }),
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestBackgroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  hasStartedLocationUpdatesAsync:    jest.fn().mockResolvedValue(false),
  startLocationUpdatesAsync:         jest.fn().mockResolvedValue(undefined),
  stopLocationUpdatesAsync:          jest.fn().mockResolvedValue(undefined),
  Accuracy: { High: 5 },
}
