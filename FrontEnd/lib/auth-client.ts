export type AuthUser = Readonly<{
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  avatarUrl: string | null;
}>;

type ApiErrorPayload = Readonly<{
  error?: { code?: string; message?: string; details?: { fieldErrors?: Record<string, string[]> } };
}>;

export class AuthApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number, public readonly fieldErrors: Record<string, string[]> = {}) {
    super(message);
    this.name = 'AuthApiError';
  }
}

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');

export async function authenticatedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: init.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json', ...init.headers } : init.headers,
    });
  } catch {
    // Browsers deliberately hide whether this was a network failure or a CORS refusal.
    // Keep the user-facing state safe while retaining the distinction from HTTP errors.
    throw new AuthApiError('CONNECTION_FAILED', 'Unable to reach the authentication service', 0);
  }

  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload & T;
  if (!response.ok) {
    throw new AuthApiError(payload.error?.code ?? 'REQUEST_FAILED', payload.error?.message ?? 'Authentication request failed', response.status, payload.error?.details?.fieldErrors ?? {});
  }

  return payload as T;
}

export function normalisePhoneNumber(value: string): string {
  return value.replace(/[\s().-]/g, '');
}

export function isE164PhoneNumber(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(normalisePhoneNumber(value));
}

export async function requestOtp(phone: string): Promise<void> {
  await authenticatedRequest('/auth/otp/request', {
    method: 'POST',
    body: JSON.stringify({ phone: normalisePhoneNumber(phone) }),
  });
}

export async function verifyOtp(phone: string, code: string): Promise<AuthUser> {
  const payload = await authenticatedRequest<{ data: { user: AuthUser; csrfToken: string; expiresAt: string } }>('/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phone: normalisePhoneNumber(phone), code }),
  });

  return payload.data.user;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const payload = await authenticatedRequest<{ data: { user: AuthUser } }>('/auth/me');
    return payload.data.user;
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 401) return null;
    throw error;
  }
}

export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const cookieName = process.env.NEXT_PUBLIC_AUTH_CSRF_COOKIE_NAME ?? 'vybern_session_csrf';
  const prefix = `${encodeURIComponent(cookieName)}=`;
  const cookie = document.cookie.split('; ').find((item) => item.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

export function apiUrl(path: string): string {
  return `${apiBaseUrl}${path}`;
}

export async function logout(): Promise<void> {
  const csrfToken = getCsrfToken();
  if (!csrfToken) throw new AuthApiError('CSRF_MISSING', 'Session verification is unavailable', 403);

  await authenticatedRequest('/auth/logout', {
    method: 'POST',
    headers: { 'x-csrf-token': csrfToken },
  });
}
