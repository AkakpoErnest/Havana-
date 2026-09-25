import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { BricolageGrotesque_500Medium } from '@expo-google-fonts/bricolage-grotesque/500Medium';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { SessionProvider, useSession } from '../src/session';
import { C, ErrorBox, Loading, Page } from '../src/ui';
import { api } from '../src/api';
import { User } from '../src/types';
import { LaunchIntro } from '../src/LaunchIntro';
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15000 }, mutations: { retry: false } },
});
function Routes() {
  const { ready, signedIn } = useSession();
  const segments = useSegments();
  const profile = useQuery({
    queryKey: ['me'],
    queryFn: () => api<User>('/me'),
    enabled: ready && signedIn,
  });
  const needsOnboarding = profile.data?.name === 'Havana neighbour';
  useEffect(() => {
    if (!ready) return;
    if (!signedIn && segments[0] !== 'login') router.replace('/login');
    if (signedIn && profile.data) {
      if (needsOnboarding && segments[0] !== 'onboarding') router.replace('/onboarding');
      else if (!needsOnboarding && (segments[0] === 'login' || segments[0] === 'onboarding'))
        router.replace('/(tabs)');
    }
  }, [ready, signedIn, segments, profile.data, needsOnboarding]);
  if (!ready) return <Loading />;
  if (signedIn && !profile.data) {
    return profile.error ? (
      <Page>
        <ErrorBox error={profile.error} retry={() => void profile.refetch()} />
      </Page>
    ) : (
      <Loading />
    );
  }
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
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
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
  const [introVisible, setIntroVisible] = useState(true);
  const finishIntro = useCallback(() => setIntroVisible(false), []);
  const [loaded, error] = useFonts({ BricolageGrotesque_500Medium, BricolageGrotesque_700Bold });
  if (!loaded && !error) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={client}>
          <SessionProvider>
            <StatusBar style={introVisible ? 'light' : 'dark'} />
            <View
              style={{ flex: 1 }}
              accessibilityElementsHidden={introVisible}
              importantForAccessibility={introVisible ? 'no-hide-descendants' : 'auto'}
            >
              <Routes />
            </View>
            {introVisible && <LaunchIntro onFinish={finishIntro} />}
          </SessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
