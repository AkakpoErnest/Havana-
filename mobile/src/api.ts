import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
let token: string | null = null;
let expired: (() => void) | undefined;
export function onExpired(fn: () => void) {
  expired = fn;
}
const TOKEN_KEY = 'havana.token';
// expo-secure-store has no web implementation; the browser build (for laptop testing) uses localStorage.
const tokenStore =
  Platform.OS === 'web'
    ? {
        get: async () => globalThis.localStorage?.getItem(TOKEN_KEY) ?? null,
        set: async (value: string) => globalThis.localStorage?.setItem(TOKEN_KEY, value),
        remove: async () => globalThis.localStorage?.removeItem(TOKEN_KEY),
      }
    : {
        get: () => SecureStore.getItemAsync(TOKEN_KEY),
        set: (value: string) => SecureStore.setItemAsync(TOKEN_KEY, value),
        remove: () => SecureStore.deleteItemAsync(TOKEN_KEY),
      };
export async function loadToken() {
  token = await tokenStore.get();
  return token;
}
export async function saveToken(value: string | null) {
  if (value) await tokenStore.set(value);
  else await tokenStore.remove();
  token = value;
}
export function photoUrl(path?: string) {
  return path?.startsWith('/') ? API_URL + path : path;
}
// Match the backend preview naming; seed/legacy photos keep their original URL.
export function thumbUrl(path?: string) {
  const url = photoUrl(path);
  return url?.endsWith('.webp') && !url.endsWith('_thumb.webp')
    ? url.replace(/\.webp$/, '_thumb.webp')
    : url;
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
  // Allow the hosted API to wake after idle; uploads get extra time on slow connections.
  const timeout = setTimeout(() => controller.abort(), body instanceof FormData ? 90_000 : 75_000);
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
      'Cannot reach Havana right now. Check your internet connection and try again in a moment.',
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
