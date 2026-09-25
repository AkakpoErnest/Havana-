import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
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

let registered: string | null = null;

const projectId = () =>
  (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
  Constants.easConfig?.projectId;

/** Registers this phone's Expo push token with the API. Silently skips where pushes can't work
 *  (web, simulators, Expo Go on Android, no EAS projectId yet, permission denied). */
async function register() {
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
  await send(token);
}

async function send(token: string) {
  if (token === registered) return;
  await api('/me/push-token', 'POST', { token });
  registered = token;
}

/** Call before clearing the session token so this phone stops receiving the old account's pushes. */
export async function unregisterPush() {
  const token = registered;
  registered = null;
  if (token) await api('/me/push-token', 'DELETE', { token }).catch(() => undefined);
}

function openChat(data: unknown) {
  const id = (data as { conversationId?: unknown } | undefined)?.conversationId;
  if (typeof id === 'string') router.push({ pathname: '/chat/[id]', params: { id } });
}

/** Wire pushes once the signed-in app screens are available. */
export function usePushNotifications(active: boolean) {
  const cache = useQueryClient();
  useEffect(() => {
    if (!active || Platform.OS === 'web') return;
    register().catch((e) => console.warn('Push registration skipped:', e?.message ?? e));
    const tokenChange = Notifications.addPushTokenListener(() => {
      register().catch(() => undefined);
    });
    const received = Notifications.addNotificationReceivedListener((n) => {
      const id = (n.request.content.data as { conversationId?: string } | undefined)
        ?.conversationId;
      void cache.invalidateQueries({ queryKey: ['inbox'] });
      if (id) void cache.invalidateQueries({ queryKey: ['chat', id] });
    });
    const tapped = Notifications.addNotificationResponseReceivedListener((r) =>
      openChat(r.notification.request.content.data),
    );
    // Opened by tapping a push while the app was closed.
    void Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) openChat(r.notification.request.content.data);
    });
    return () => {
      tokenChange.remove();
      received.remove();
      tapped.remove();
    };
  }, [active, cache]);
}
