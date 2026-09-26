import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { loadToken, onExpired, saveToken } from './api';
import { unregisterPush } from './notifications';
const Context = createContext({
  ready: false,
  signedIn: false,
  signIn: async (_token: string) => {},
  signOut: async () => {},
});
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const cache = useQueryClient();
  useEffect(() => {
    loadToken()
      .then((t) => {
        setSignedIn(!!t);
        // Signed out but a push token is still stored (offline logout/expiry): retry the cleanup (SEC-002).
        if (!t) void unregisterPush();
      })
      .catch(() => setSignedIn(false))
      .finally(() => setReady(true));
    onExpired(() => {
      void unregisterPush();
      void saveToken(null);
      setSignedIn(false);
      cache.clear();
    });
  }, [cache]);
  return (
    <Context.Provider
      value={{
        ready,
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
