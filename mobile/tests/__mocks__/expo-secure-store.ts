// In-memory SecureStore for tests — no native code required
const _store: Record<string, string> = {}

export const getItemAsync = jest.fn(async (key: string): Promise<string | null> => {
  return _store[key] ?? null
})

export const setItemAsync = jest.fn(async (key: string, value: string): Promise<void> => {
  _store[key] = value
})

export const deleteItemAsync = jest.fn(async (key: string): Promise<void> => {
  delete _store[key]
})

export function __clearStore() {
  Object.keys(_store).forEach((k) => delete _store[k])
}
