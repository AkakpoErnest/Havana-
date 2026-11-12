import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { loadToken, onExpired, saveToken } from './api';
import { flushPendingPush, unregisterPush } from './notifications';
const Context = createContext({
  ready: false,
  signedIn: false,
  startupError: null as Error | null,
  retryStartup: () => {},
  signIn: async (_token: string) => {},
  signOut: async () => {},
});
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [startupError, setStartupError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cache = useQueryClient();
  useEffect(() => {
    let active = true;
    loadToken()
      .then((t) => {
        if (!active) return;
        setSignedIn(!!t);
        // Signed out but a push token is still stored (offline logout/expiry): retry the cleanup (SEC-002).
        if (!t) flushPendingPush();
      })
      .catch((error: unknown) => {
        if (active)
          setStartupError(
            error instanceof Error ? error : new Error('Could not open your saved login.'),
          );
      })
      .finally(() => {
        if (active) setReady(true);
      });
    onExpired(() => {
      void unregisterPush();
      void saveToken(null);
      setSignedIn(false);
      cache.clear();
    });
    return () => {
      active = false;
    };
  }, [cache, attempt]);
  return (
    <Context.Provider
      value={{
        ready,
        startupError,
        retryStartup: () => {
          setStartupError(null);
          setReady(false);
          setAttempt((value) => value + 1);
        },
        signedIn,
        signIn: async (token) => {
          await saveToken(token);
          cache.clear();
          setSignedIn(true);
        },
        signOut: async () => {
          // Needs the old token, so it runs before the session is cleared.
          await unregisterPush();
          await saveToken(null);
          setSignedIn(false);
          cache.clear();
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useSession = () => useContext(Context);
