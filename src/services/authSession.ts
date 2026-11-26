export const AUTH_SESSION_EXPIRED_EVENT = 'smartsales:auth-session-expired'

export function notifyAuthenticationExpired() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT))
}
