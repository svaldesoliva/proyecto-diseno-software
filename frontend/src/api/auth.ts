export interface Session {
  user: { id: string; name: string } | null
  googleEnabled: boolean
}

export async function getSession(signal: AbortSignal): Promise<Session> {
  const response = await fetch('/api/auth/session', { signal })
  if (!response.ok) throw new Error('auth.loadError')
  return response.json()
}

export async function changeSession(
  action: 'login' | 'register' | 'logout',
  credentials?: { username: string; password: string },
): Promise<Session['user']> {
  const response = await fetch(`/api/auth/${action}`, {
    method: 'POST',
    headers: credentials ? { 'Content-Type': 'application/json' } : undefined,
    body: credentials ? JSON.stringify(credentials) : undefined,
  })

  if (!response.ok) {
    const { error } = await response.json().catch(() => ({}))
    throw new Error(typeof error === 'string' ? `auth.${error}` : 'auth.requestError')
  }
  if (action === 'logout') return null

  const { user } = await response.json()
  return user
}
