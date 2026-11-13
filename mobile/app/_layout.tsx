import React, { useCallback, useEffect, useState } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { BricolageGrotesque_500Medium } from '@expo-google-fonts/bricolage-grotesque/500Medium';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { SessionProvider, useSession } from '../src/session';
import { Button, C, ErrorBox, Loading, Page, T } from '../src/ui';
import { api } from '../src/api';
import { User } from '../src/types';
import { LaunchIntro } from '../src/LaunchIntro';
import { usePushNotifications } from '../src/notifications';
import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';

// Keep the native brand screen visible until fonts and the first app frame are ready.
void SplashScreen.preventAutoHideAsync().catch(() => {});
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15000 }, mutations: { retry: false } },
});
/** Opening the app while signed in: a sleeping server can take a minute to answer `/me`. After 20 s,
 *  offer a retry and a way out, so nobody is stuck looking at a spinner. */
function StartupWait({ retry, signOut }: { retry: () => void; signOut: () => void }) {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setStuck(true), 20_000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <Page>
      <Loading />
      <StartupVersion />
      {stuck && (
        <View style={{ gap: 10 }}>
          <T style={{ color: C.muted, textAlign: 'center' }}>
            Still waiting. Check your internet connection, or try again.
          </T>
          <Button title="Try again" onPress={retry} />
          <Button title="Log out" outline onPress={signOut} />
        </View>
      )}
    </Page>
  );
}
function StartupVersion() {
  return (
    <T style={{ color: C.muted, textAlign: 'center' }}>
      Havana {Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? 'unknown'} · startup
      fix 1
    </T>
  );
}
function Routes() {
  const { ready, signedIn, signOut, startupError, retryStartup } = useSession();
  const profile = useQuery({
    queryKey: ['me'],
    queryFn: ({ signal }) => api<User>('/me', 'GET', undefined, { timeoutMs: 20_000, signal }),
    retry: false,
    enabled: ready && signedIn,
  });
  const needsOnboarding = profile.data?.name === 'Havana neighbour';
  usePushNotifications(signedIn && !!profile.data && !needsOnboarding);
  const retryProfile = async () => {
    await client.cancelQueries({ queryKey: ['me'], exact: true });
    void profile.refetch();
  };
  if (startupError)
    return (
      <Page>
        <ErrorBox error={startupError} retry={retryStartup} />
        <StartupVersion />
      </Page>
    );
  if (!ready)
    return (
      <Page>
        <Loading />
        <StartupVersion />
      </Page>
    );
  if (signedIn && !profile.data) {
    return profile.error ? (
      <Page>
        <StartupVersion />
        <ErrorBox error={profile.error} retry={() => void retryProfile()} />
        <Button title="Log out" outline onPress={() => void signOut()} />
      </Page>
    ) : (
      <StartupWait retry={() => void retryProfile()} signOut={() => void signOut()} />
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
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && needsOnboarding}>
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !!profile.data && !needsOnboarding}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="item/[id]" options={{ title: 'A good find' }} />
        <Stack.Screen name="chat/[id]" options={{ title: 'Make a little deal' }} />
        <Stack.Screen
          name="match"
          options={{ headerShown: false, presentation: 'fullScreenModal' }}
        />
        <Stack.Screen name="backup" options={{ title: 'Backup login' }} />
        <Stack.Screen name="moderation" options={{ title: 'Review reports' }} />
      </Stack.Protected>
    </Stack>
  );
}
/** On a computer browser the app is laid out for phones, so show it as a centred phone-width column
 *  instead of stretching buttons and fields across the whole screen. */
const desktop = {
  frame: { flex: 1, backgroundColor: C.line, alignItems: 'center' as const },
  column: {
    flex: 1,
    width: '100%' as const,
    maxWidth: 480,
    backgroundColor: C.bg,
    boxShadow: '0 0 40px rgba(35, 32, 107, 0.12)',
  },
};
export default function Layout() {
  const { width } = useWindowDimensions();
  const wide = Platform.OS === 'web' && width > 560;
  const [introVisible, setIntroVisible] = useState(true);
  const finishIntro = useCallback(() => setIntroVisible(false), []);
  const [loaded, error] = useFonts({ BricolageGrotesque_500Medium, BricolageGrotesque_700Bold });
  if (!loaded && !error) return null;
  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: C.brand }}
      onLayout={() => void SplashScreen.hideAsync().catch(() => {})}
    >
      <SafeAreaProvider>
        <QueryClientProvider client={client}>
          <SessionProvider>
            <StatusBar style={introVisible ? 'light' : 'dark'} />
            <View
              style={wide ? desktop.frame : { flex: 1, backgroundColor: C.bg }}
              accessibilityElementsHidden={introVisible}
              importantForAccessibility={introVisible ? 'no-hide-descendants' : 'auto'}
            >
              <View style={wide ? desktop.column : { flex: 1 }}>
                <Routes />
              </View>
            </View>
            {introVisible && <LaunchIntro onFinish={finishIntro} />}
          </SessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
