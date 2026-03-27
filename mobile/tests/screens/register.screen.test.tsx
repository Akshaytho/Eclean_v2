/**
 * REGISTER SCREEN — UI FLOW TESTS
 * Role selection cards + form validation + full data flow
 */
import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { RegisterScreen } from '../../src/screens/auth/RegisterScreen'
import { authApi }        from '../../src/api/auth.api'
import { useAuthStore }   from '../../src/stores/authStore'
import * as SecureStore   from 'expo-secure-store'

jest.mock('../../src/api/auth.api')
const mockApi = authApi as jest.Mocked<typeof authApi>

const mockNavigate = jest.fn()
const nav = { navigate: mockNavigate, goBack: jest.fn() } as any

const makeRes = (role: string) => ({
  accessToken: 'tok.access', refreshToken: 'tok.refresh', expiresIn: 900,
  user: { id: 'u1', email: 'new@eclean.test', name: 'New User', role },
})

const fill = (screen: any, name: string, email: string, password: string) => {
  fireEvent.changeText(screen.getByPlaceholderText('John Doe'), name)
  fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), email)
  fireEvent.changeText(screen.getByPlaceholderText(/Min\. 8 characters/), password)
}

beforeEach(() => {
  jest.clearAllMocks()
  useAuthStore.setState({ user: null, isLoggedIn: false, isLoading: false })
})

// ─── Render ──────────────────────────────────────────────────────────────────

describe('RegisterScreen — render', () => {
  it('shows Worker, Buyer, Citizen role cards', () => {
    const { getByText } = render(<RegisterScreen navigation={nav} />)
    expect(getByText('Worker')).toBeTruthy()
    expect(getByText('Buyer')).toBeTruthy()
    expect(getByText('Citizen')).toBeTruthy()
  })

  it('shows name, email, password inputs', () => {
    const { getByPlaceholderText } = render(<RegisterScreen navigation={nav} />)
    expect(getByPlaceholderText('John Doe')).toBeTruthy()
    expect(getByPlaceholderText('you@example.com')).toBeTruthy()
    expect(getByPlaceholderText(/Min\. 8 characters/)).toBeTruthy()
  })
})

// ─── Validation ───────────────────────────────────────────────────────────────

describe('RegisterScreen — validation', () => {
  it('blocks API when all fields empty', async () => {
    const { getByText } = render(<RegisterScreen navigation={nav} />)
    fireEvent.press(getByText('Create Account'))
    await waitFor(() => expect(getByText('All fields are required.')).toBeTruthy())
    expect(mockApi.register).not.toHaveBeenCalled()
  })

  it('blocks API on invalid email format', async () => {
    const screen = render(<RegisterScreen navigation={nav} />)
    fill(screen, 'Alice', 'not-an-email', 'Secure@1')
    fireEvent.press(screen.getByText('Create Account'))
    await waitFor(() => expect(screen.getByText('Please enter a valid email address.')).toBeTruthy())
    expect(mockApi.register).not.toHaveBeenCalled()
  })

  it('blocks API when password shorter than 8 chars', async () => {
    const screen = render(<RegisterScreen navigation={nav} />)
    fill(screen, 'Alice', 'alice@eclean.test', 'Ab1')
    fireEvent.press(screen.getByText('Create Account'))
    await waitFor(() => expect(screen.getByText('Password must be at least 8 characters.')).toBeTruthy())
    expect(mockApi.register).not.toHaveBeenCalled()
  })
})

// ─── Role selection → API ────────────────────────────────────────────────────

describe('RegisterScreen — role card selection', () => {
  it('default role WORKER is sent when no card tapped', async () => {
    mockApi.register.mockResolvedValue(makeRes('WORKER') as any)
    mockApi.saveDeviceToken.mockResolvedValue(undefined as any)
    const screen = render(<RegisterScreen navigation={nav} />)
    fill(screen, 'Test Worker', 'worker@eclean.test', 'Secure@1')
    fireEvent.press(screen.getByText('Create Account'))
    await waitFor(() => expect(mockApi.register).toHaveBeenCalled())
    expect(mockApi.register).toHaveBeenCalledWith(expect.objectContaining({ role: 'WORKER' }))
  })

  it('tapping Buyer card sends role: BUYER to the API', async () => {
    mockApi.register.mockResolvedValue(makeRes('BUYER') as any)
    mockApi.saveDeviceToken.mockResolvedValue(undefined as any)
    const screen = render(<RegisterScreen navigation={nav} />)
    fireEvent.press(screen.getByText('Buyer'))
    fill(screen, 'Test Buyer', 'buyer@eclean.test', 'Secure@1')
    fireEvent.press(screen.getByText('Create Account'))
    await waitFor(() => expect(mockApi.register).toHaveBeenCalled())
    expect(mockApi.register).toHaveBeenCalledWith(expect.objectContaining({ role: 'BUYER' }))
  })

  it('tapping Citizen card sends role: CITIZEN to the API', async () => {
    mockApi.register.mockResolvedValue(makeRes('CITIZEN') as any)
    mockApi.saveDeviceToken.mockResolvedValue(undefined as any)
    const screen = render(<RegisterScreen navigation={nav} />)
    fireEvent.press(screen.getByText('Citizen'))
    fill(screen, 'Test Citizen', 'citizen@eclean.test', 'Secure@1')
    fireEvent.press(screen.getByText('Create Account'))
    await waitFor(() => expect(mockApi.register).toHaveBeenCalled())
    expect(mockApi.register).toHaveBeenCalledWith(expect.objectContaining({ role: 'CITIZEN' }))
  })
})

// ─── Happy path ──────────────────────────────────────────────────────────────

describe('RegisterScreen — successful registration', () => {
  beforeEach(() => {
    mockApi.register.mockResolvedValue(makeRes('WORKER') as any)
    mockApi.saveDeviceToken.mockResolvedValue(undefined as any)
  })

  it('sends trimmed name and lowercased email', async () => {
    const screen = render(<RegisterScreen navigation={nav} />)
    fill(screen, '  Test Worker  ', '  Worker@ECLEAN.TEST  ', 'Secure@1')
    fireEvent.press(screen.getByText('Create Account'))
    await waitFor(() => expect(mockApi.register).toHaveBeenCalled())
    expect(mockApi.register).toHaveBeenCalledWith({
      name: 'Test Worker', email: 'worker@eclean.test', password: 'Secure@1', role: 'WORKER',
    })
  })

  it('saves both tokens to SecureStore', async () => {
    const screen = render(<RegisterScreen navigation={nav} />)
    fill(screen, 'Test Worker', 'worker@eclean.test', 'Secure@1')
    fireEvent.press(screen.getByText('Create Account'))
    await waitFor(() => expect(mockApi.register).toHaveBeenCalled())
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('eclean_access_token',  'tok.access')
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('eclean_refresh_token', 'tok.refresh')
  })

  it('sets isLoggedIn=true in authStore', async () => {
    const screen = render(<RegisterScreen navigation={nav} />)
    fill(screen, 'Test Worker', 'worker@eclean.test', 'Secure@1')
    fireEvent.press(screen.getByText('Create Account'))
    await waitFor(() => expect(useAuthStore.getState().isLoggedIn).toBe(true))
    expect(useAuthStore.getState().user?.role).toBe('WORKER')
  })
})

// ─── Error path ───────────────────────────────────────────────────────────────

describe('RegisterScreen — backend errors', () => {
  it('shows "Email already registered" on 409', async () => {
    mockApi.register.mockRejectedValue({ response: { data: { error: { message: 'Email already registered' } } } })
    const screen = render(<RegisterScreen navigation={nav} />)
    fill(screen, 'Dup User', 'existing@eclean.test', 'Secure@1')
    fireEvent.press(screen.getByText('Create Account'))
    await waitFor(() => expect(screen.getByText('Email already registered')).toBeTruthy())
    expect(useAuthStore.getState().isLoggedIn).toBe(false)
  })

  it('shows fallback on network error', async () => {
    mockApi.register.mockRejectedValue(new Error('Network Error'))
    const screen = render(<RegisterScreen navigation={nav} />)
    fill(screen, 'User', 'u@e.test', 'Secure@1')
    fireEvent.press(screen.getByText('Create Account'))
    await waitFor(() => expect(screen.getByText('Registration failed. Try again.')).toBeTruthy())
  })
})

// ─── Navigation ───────────────────────────────────────────────────────────────

describe('RegisterScreen — navigation', () => {
  it('navigates to Login when Sign In link tapped', () => {
    const { getByText } = render(<RegisterScreen navigation={nav} />)
    fireEvent.press(getByText('Sign In'))
    expect(mockNavigate).toHaveBeenCalledWith('Login')
  })
})
