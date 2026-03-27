import React from 'react'
import { render } from '@testing-library/react-native'
import { LoginScreen } from '../../src/screens/auth/LoginScreen'

jest.mock('../../src/api/auth.api', () => ({
  authApi: { login: jest.fn(), saveDeviceToken: jest.fn().mockResolvedValue(undefined) },
}))

const nav = { navigate: jest.fn(), goBack: jest.fn() } as any

test('LoginScreen renders email + password fields', () => {
  const { getByPlaceholderText, getAllByText } = render(<LoginScreen navigation={nav} />)
  expect(getByPlaceholderText('you@example.com')).toBeTruthy()
  expect(getByPlaceholderText('Your password')).toBeTruthy()
  expect(getAllByText('Sign In').length).toBeGreaterThan(0)
})
