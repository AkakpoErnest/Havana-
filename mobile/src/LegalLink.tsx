import React, { useState } from 'react';
import { Linking } from 'react-native';
import { photoUrl } from './api';
import { C, T } from './ui';

export function LegalLink({ path, children }: { path: string; children: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  return (
    <T
      accessibilityRole="link"
      style={{ color: C.brand, textDecorationLine: 'underline' }}
      onPress={() => {
        setFailed(false);
        void Linking.openURL(photoUrl(path)!).catch(() => setFailed(true));
      }}
    >
      {children}
      {failed ? ' (Could not open link. Tap to retry.)' : ''}
    </T>
  );
}
