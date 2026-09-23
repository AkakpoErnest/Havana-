import React, { useEffect } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { BricolageGrotesque_500Medium } from '@expo-google-fonts/bricolage-grotesque/500Medium';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { SessionProvider, useSession } from '../src/session';
import { C, Loading } from '../src/ui';
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15000 }, mutations: { retry: false } },
});
function Routes() {
  const { ready, signedIn } = useSession();
  const segments = useSegments();
  useEffect(() => {
    if (!ready) return;
    if (!signedIn && segments[0] !== 'login') router.replace('/login');
    if (signedIn && segments[0] === 'login') router.replace('/(tabs)');
  }, [ready, signedIn, segments]);
  if (!ready) return <Loading />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.brand,
        headerTitleStyle: { fontFamily: 'BricolageGrotesque_700Bold' },
        contentStyle: { backgroundColor: C.bg },
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="item/[id]" options={{ title: 'A good find' }} />
      <Stack.Screen name="chat/[id]" options={{ title: 'Make a little deal' }} />
      <Stack.Screen
        name="match"
        options={{ headerShown: false, presentation: 'fullScreenModal' }}
      />
      <Stack.Screen name="backup" options={{ title: 'Backup login' }} />
    </Stack>
  );
}
export default function Layout() {
  const [loaded, error] = useFonts({ BricolageGrotesque_500Medium, BricolageGrotesque_700Bold });
  if (!loaded && !error) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={client}>
          <SessionProvider>
            <StatusBar style="dark" />
            <Routes />
          </SessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
