/**
 * LOGIN SCREEN — UI FLOW TESTS
 * Renders the real LoginScreen and simulates user interactions.
 */
import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { LoginScreen } from '../../src/screens/auth/LoginScreen'
import { authApi }     from '../../src/api/auth.api'
import { useAuthStore } from '../../src/stores/authStore'
import * as SecureStore from 'expo-secure-store'

jest.mock('../../src/api/auth.api')
const mockApi = authApi as jest.Mocked<typeof authApi>

const mockNavigate = jest.fn()
const nav = { navigate: mockNavigate, goBack: jest.fn() } as any

const VALID_RESPONSE = {
  accessToken: 'tok.access', refreshToken: 'tok.refresh', expiresIn: 900,
  user: { id: 'u1', email: 'worker@eclean.test', name: 'Test Worker', role: 'WORKER' as const },
}

// LoginScreen renders <Text>Sign In</Text> as a title AND as the button label.
// The button (last occurrence) is the one with an onPress handler.
const pressSignIn = (screen: ReturnType<typeof render>) => {
  const buttons = screen.getAllByText('Sign In')
  fireEvent.press(buttons[buttons.length - 1])
}

beforeEach(() => {
  jest.clearAllMocks()
  useAuthStore.setState({ user: null, isLoggedIn: false, isLoading: false })
})

// ─── Initial render ───────────────────────────────────────────────────────────

describe('LoginScreen — initial render', () => {
  it('shows email input, password input, and Sign In button', () => {
    const screen = render(<LoginScreen navigation={nav} />)
    expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy()
    expect(screen.getByPlaceholderText('Your password')).toBeTruthy()
    expect(screen.getAllByText('Sign In').length).toBeGreaterThan(0)
  })

  it('shows Forgot password and Register links', () => {
    const { getByText } = render(<LoginScreen navigation={nav} />)
    expect(getByText('Forgot password?')).toBeTruthy()
    expect(getByText('Register')).toBeTruthy()
  })

  it('shows no error on first render', () => {
    const { queryByText } = render(<LoginScreen navigation={nav} />)
    expect(queryByText(/required|invalid|incorrect/i)).toBeNull()
  })
})

// ─── Validation ────────────────────────────────────────────────────────────────

describe('LoginScreen — validation blocks the API', () => {
  it('shows error + does NOT call API when both fields empty', async () => {
    const screen = render(<LoginScreen navigation={nav} />)
    pressSignIn(screen)
    await waitFor(() =>
      expect(screen.getByText('Email and password are required.')).toBeTruthy()
    )
    expect(mockApi.login).not.toHaveBeenCalled()
  })

  it('shows error when only email is filled', async () => {
    const screen = render(<LoginScreen navigation={nav} />)
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'worker@eclean.test')
    pressSignIn(screen)
    await waitFor(() =>
      expect(screen.getByText('Email and password are required.')).toBeTruthy()
    )
    expect(mockApi.login).not.toHaveBeenCalled()
  })

  it('shows error when only password is filled', async () => {
    const screen = render(<LoginScreen navigation={nav} />)
    fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'Test@1234')
    pressSignIn(screen)
    await waitFor(() =>
      expect(screen.getByText('Email and password are required.')).toBeTruthy()
    )
    expect(mockApi.login).not.toHaveBeenCalled()
  })
})

// ─── Happy path ────────────────────────────────────────────────────────────────

describe('LoginScreen — successful login', () => {
  beforeEach(() => {
    mockApi.login.mockResolvedValue(VALID_RESPONSE)
    mockApi.saveDeviceToken.mockResolvedValue(undefined as any)
  })

  it('sends trimmed + lowercased email to the API', async () => {
    const screen = render(<LoginScreen navigation={nav} />)
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), '  Worker@ECLEAN.test  ')
    fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'Test@1234')
    pressSignIn(screen)
    await waitFor(() => expect(mockApi.login).toHaveBeenCalledTimes(1))
    expect(mockApi.login).toHaveBeenCalledWith('worker@eclean.test', 'Test@1234')
  })

  it('saves access + refresh tokens to SecureStore', async () => {
    const screen = render(<LoginScreen navigation={nav} />)
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'worker@eclean.test')
    fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'Test@1234')
    pressSignIn(screen)
    await waitFor(() => expect(mockApi.login).toHaveBeenCalled())
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('eclean_access_token',  'tok.access')
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('eclean_refresh_token', 'tok.refresh')
  })

  it('sets isLoggedIn=true and user in authStore', async () => {
    const screen = render(<LoginScreen navigation={nav} />)
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'worker@eclean.test')
    fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'Test@1234')
    pressSignIn(screen)
    await waitFor(() => {
      expect(useAuthStore.getState().isLoggedIn).toBe(true)
      expect(useAuthStore.getState().user?.role).toBe('WORKER')
    })
  })
})

// ─── Error path ────────────────────────────────────────────────────────────────

describe('LoginScreen — backend errors', () => {
  it('shows the API error message on 401', async () => {
    mockApi.login.mockRejectedValue({
      response: { data: { error: { message: 'Invalid email or password' } } },
    })
    const screen = render(<LoginScreen navigation={nav} />)
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'bad@eclean.test')
    fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'Wrong1')
    pressSignIn(screen)
    await waitFor(() => expect(screen.getByText('Invalid email or password')).toBeTruthy())
  })

  it('shows fallback message on network error', async () => {
    mockApi.login.mockRejectedValue(new Error('Network Error'))
    const screen = render(<LoginScreen navigation={nav} />)
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'worker@eclean.test')
    fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'Test@1234')
    pressSignIn(screen)
    await waitFor(() => expect(screen.getByText('Invalid email or password.')).toBeTruthy())
  })

  it('does NOT update authStore on failure', async () => {
    mockApi.login.mockRejectedValue({ response: { data: {} } })
    const screen = render(<LoginScreen navigation={nav} />)
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'bad@eclean.test')
    fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'Wrong1')
    pressSignIn(screen)
    await waitFor(() => expect(mockApi.login).toHaveBeenCalled())
    expect(useAuthStore.getState().isLoggedIn).toBe(false)
    expect(useAuthStore.getState().user).toBeNull()
  })
})

// ─── Navigation ────────────────────────────────────────────────────────────────

describe('LoginScreen — navigation links', () => {
  it('navigates to ForgotPassword when link tapped', () => {
    const { getByText } = render(<LoginScreen navigation={nav} />)
    fireEvent.press(getByText('Forgot password?'))
    expect(mockNavigate).toHaveBeenCalledWith('ForgotPassword')
  })

  it('navigates to Register when link tapped', () => {
    const { getByText } = render(<LoginScreen navigation={nav} />)
    fireEvent.press(getByText('Register'))
    expect(mockNavigate).toHaveBeenCalledWith('Register')
  })
})
