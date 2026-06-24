const positiveNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const env = Object.freeze({
  appName: import.meta.env.VITE_APP_NAME?.trim() || 'Shop Admin',
  // Empty means same-origin. During development, Vite proxies /api to the backend.
  apiUrl: (import.meta.env.VITE_API_URL?.trim() || '').replace(/\/$/, ''),
  requestTimeoutMs: positiveNumber(import.meta.env.VITE_REQUEST_TIMEOUT_MS, 30_000),
})
