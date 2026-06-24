export interface AuthResponse {
  token: string
  username: string
  expiresAt: string
}

export interface LoginRequest {
  username: string
  password: string
}

export interface RegisterRequest {
  username: string
  email: string
  password: string
}

export interface AuthState {
  session: AuthResponse | null
}
