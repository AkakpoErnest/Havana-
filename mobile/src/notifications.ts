import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { createPushState } from './push-state';

// Show pushes as banners even while the app is open (the server only notifies the *other* person).
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Registration bookkeeping lives in push-state.ts (unit-tested for the SEC-002 races).
const push = createPushState(
  {
    get: (k) => SecureStore.getItemAsync(k).catch(() => null),
    set: (k, v) => SecureStore.setItemAsync(k, v),
    remove: (k) => SecureStore.deleteItemAsync(k),
  },
  {
    register: async (token) =>
      (await api<{ registration: string }>('/me/push-token', 'POST', { token })).registration,
    unregister: async (r) => {
      await api('/push-token/unregister', 'POST', r);
    },
  },
);
// Notification taps already acted on, so a cached response can't reopen a chat later (APP-001).
const handled = new Set<string>();

if (Platform.OS !== 'web') {
  // Retry queued cleanups whenever the app comes back to the foreground (e.g. after reconnecting).
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void push.flush().catch(() => undefined);
  });
}

const projectId = () =>
  (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
  Constants.easConfig?.projectId;

/** Registers this phone's Expo push token for session `gen`. Silently skips where pushes can't work
 *  (web, simulators, Expo Go on Android, no EAS projectId yet, permission denied). */
async function register(gen: number) {
  if (Platform.OS === 'web' || !Device.isDevice || !projectId()) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Messages & offers',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#F0437B',
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data;
  await push.register(gen, token);
}

/** Logout, session expiry, account deletion: local-only and quick; the server cleanup runs in the background. */
export async function unregisterPush() {
  if (Platform.OS !== 'web') await push.end().catch(() => undefined);
}

/** Retry cleanups left over from an offline logout (called on signed-out launch). */
export function flushPendingPush() {
  if (Platform.OS !== 'web') void push.flush().catch(() => undefined);
}

function openChat(response: Notifications.NotificationResponse) {
  const key = response.notification.request.identifier;
  if (handled.has(key)) return;
  handled.add(key);
  Notifications.clearLastNotificationResponse();
  const id = (
    response.notification.request.content.data as { conversationId?: unknown } | undefined
  )?.conversationId;
  if (typeof id === 'string') router.push({ pathname: '/chat/[id]', params: { id } });
}

/** Wire pushes once the signed-in app screens are available. */
export function usePushNotifications(active: boolean) {
  const cache = useQueryClient();
  useEffect(() => {
    if (!active || Platform.OS === 'web') return;
    const gen = push.begin();
    let live = true;
    register(gen).catch((e) => console.warn('Push registration skipped:', e?.message ?? e));
    const tokenChange = Notifications.addPushTokenListener(() => {
      if (live) register(gen).catch(() => undefined);
    });
    const received = Notifications.addNotificationReceivedListener((n) => {
      const id = (n.request.content.data as { conversationId?: string } | undefined)
        ?.conversationId;
      void cache.invalidateQueries({ queryKey: ['inbox'] });
      if (id) void cache.invalidateQueries({ queryKey: ['chat', id] });
    });
    const tapped = Notifications.addNotificationResponseReceivedListener((r) => {
      if (live) openChat(r);
    });
    // Opened by tapping a push while the app was closed; handled at most once.
    void Notifications.getLastNotificationResponseAsync().then((r) => {
      if (live && r) openChat(r);
    });
    return () => {
      live = false;
      tokenChange.remove();
      received.remove();
      tapped.remove();
    };
  }, [active, cache]);
}
