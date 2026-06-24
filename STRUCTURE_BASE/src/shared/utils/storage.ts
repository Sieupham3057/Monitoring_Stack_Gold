export const safeStorage = {
  get<T>(key: string): T | null {
    try {
      const value = localStorage.getItem(key)
      return value ? (JSON.parse(value) as T) : null
    } catch {
      return null
    }
  },
  set<T>(key: string, value: T) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Storage can be unavailable in private mode or strict browser policies.
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key)
    } catch {
      // Intentionally ignored.
    }
  },
}
