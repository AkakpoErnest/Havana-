import * as SecureStore from 'expo-secure-store';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
let token: string | null = null;
let expired: (() => void) | undefined;
export function onExpired(fn: () => void) {
  expired = fn;
}
export async function loadToken() {
  token = await SecureStore.getItemAsync('havana.token');
  return token;
}
export async function saveToken(value: string | null) {
  if (value) await SecureStore.setItemAsync('havana.token', value);
  else await SecureStore.deleteItemAsync('havana.token');
  token = value;
}
export function photoUrl(path?: string) {
  return path?.startsWith('/') ? API_URL + path : path;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (!API_URL)
    throw new Error(
      'Set EXPO_PUBLIC_API_URL in mobile/.env to your laptop’s Wi-Fi address, then restart Expo.',
    );
  let response: Response;
  const controller = new AbortController();
  // Uploads on 3G can take longer than normal API requests.
  const timeout = setTimeout(() => controller.abort(), body instanceof FormData ? 90_000 : 20_000);
  try {
    response = await fetch(API_URL + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new Error(
      'Cannot reach Havana. Check your connection and make sure the API is running on the same Wi-Fi. Please retry.',
    );
  } finally {
    clearTimeout(timeout);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) expired?.();
    throw new ApiError(
      Array.isArray(data.message)
        ? data.message.join('\n')
        : (data.message ?? 'Something went wrong. Please retry.'),
      response.status,
    );
  }
  return data as T;
}
