import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { loadToken, onExpired, saveToken } from './api';
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
      .then((t) => setSignedIn(!!t))
      .catch(() => setSignedIn(false))
      .finally(() => setReady(true));
    onExpired(() => {
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
