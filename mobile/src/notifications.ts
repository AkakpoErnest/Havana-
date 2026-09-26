import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api';

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

const TOKEN_KEY = 'havana.pushToken';
// Bumped whenever the signed-in session changes; registrations from an older session undo themselves (SEC-002).
let generation = 0;
let registeredGeneration = -1;
// Notification taps already acted on, so a cached response can't reopen a chat later (APP-001).
const handled = new Set<string>();

const projectId = () =>
  (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
  Constants.easConfig?.projectId;

const storedToken = () =>
  Platform.OS === 'web'
    ? Promise.resolve(null)
    : SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
const rememberToken = (token: string | null) =>
  token ? SecureStore.setItemAsync(TOKEN_KEY, token) : SecureStore.deleteItemAsync(TOKEN_KEY);

/** Registers this phone's Expo push token for the current session. Silently skips where pushes can't work
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
  const token =
    status === 'granted'
      ? (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data
      : null;
  if (!token || gen !== generation) return;
  await rememberToken(token);
  await api('/me/push-token', 'POST', { token });
  if (gen === generation) registeredGeneration = gen;
  // The session ended while we were registering: undo (without cancelling a newer session's registration),
  // unless that newer session already claimed the token.
  else if (registeredGeneration < gen) await forget(token);
}

async function forget(token: string) {
  try {
    await api('/push-token/unregister', 'POST', { token });
    await rememberToken(null);
  } catch {
    // Offline: kept for the retry at next launch.
  }
}

/** Stops pushes to this phone. Works without a session (expired or offline logout): the token itself is the proof.
 *  If the server can't be reached, the token stays stored and the next launch retries (see SessionProvider). */
export async function unregisterPush() {
  generation++;
  const token = await storedToken();
  if (token) await forget(token);
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
    const gen = ++generation;
    let live = true;
    register(gen).catch((e) => console.warn('Push registration skipped:', e?.message ?? e));
    const tokenChange = Notifications.addPushTokenListener(() => {
      if (live) register(generation).catch(() => undefined);
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
