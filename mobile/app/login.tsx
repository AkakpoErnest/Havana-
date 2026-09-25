import React, { useState } from 'react';
import { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { api } from '../src/api';
import { useSession } from '../src/session';
import { LoginType, useLoginMethods } from '../src/login-methods';
import {
  Button,
  C,
  Chips,
  ConnectionWait,
  ErrorBox,
  Field,
  Page,
  Safety,
  T,
  Title,
} from '../src/ui';
export default function Login() {
  const [chosen, setType] = useState<LoginType>('PHONE'),
    [value, setValue] = useState(''),
    [code, setCode] = useState('');
  const { offered, phoneOff } = useLoginMethods();
  // Fall back to an offered type (e.g. EMAIL while phone login waits for SMS).
  const type = offered.includes(chosen) ? chosen : (offered[0] ?? chosen);
  const session = useSession();
  const send = useMutation({
    mutationFn: () =>
      api<{ challengeId: string; devCode?: string }>('/auth/request', 'POST', {
        type,
        value: value.trim(),
      }),
  });
  const verify = useMutation({
    mutationFn: async () => {
      const r = await api<{ token: string }>('/auth/verify', 'POST', {
        challengeId: send.data?.challengeId,
        code,
      });
      await session.signIn(r.token);
    },
  });
  return (
    <Page>
      <View style={{ paddingVertical: 35, gap: 14 }}>
        <T
          style={{
            color: C.brand,
            fontSize: 54,
            fontFamily: 'BricolageGrotesque_700Bold',
            letterSpacing: -3,
          }}
        >
          havana<T style={{ color: C.pink, fontSize: 54 }}>.</T>
        </T>
        <T style={{ color: C.leaf, fontSize: 12, letterSpacing: 3 }}>
          ACCRA’S SECOND-HAND SWEET SPOT
        </T>
        <Title>Good things.{'\n'}New stories.</Title>
        <T style={{ color: C.muted, lineHeight: 24 }}>
          Buy it. Haggle a little. Swap for something you love.
        </T>
      </View>
      {!send.data ? (
        <>
          {offered.length > 1 && (
            <Chips
              values={offered}
              value={type}
              onChange={(next) => setType(next as LoginType)}
              disabled={send.isPending}
            />
          )}
          {phoneOff && (
            <T style={{ color: C.muted, fontSize: 13 }}>
              Phone login is coming soon. Sign in with your email for now.
            </T>
          )}
          <Field
            label={type === 'PHONE' ? 'Your Ghana phone number' : 'Your email'}
            value={value}
            onChangeText={setValue}
            editable={!send.isPending}
            keyboardType={type === 'PHONE' ? 'phone-pad' : 'email-address'}
            autoCapitalize="none"
            placeholder={type === 'PHONE' ? '0541234567' : 'you@example.com'}
          />
          <Button
            title={send.isPending ? 'Sending…' : 'Send my code →'}
            disabled={send.isPending || !value.trim()}
            onPress={() => send.mutate()}
          />
        </>
      ) : (
        <>
          <Title>You’re almost in.</Title>
          <T>Enter the 6-digit code sent to {value}.</T>
          {send.data.devCode && (
            <T style={{ color: C.leaf }}>Development code: {send.data.devCode}</T>
          )}
          <Field
            label="Your code"
            value={code}
            onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
            editable={!verify.isPending}
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="one-time-code"
          />
          <Button
            title={verify.isPending ? 'Checking…' : 'Let’s go →'}
            disabled={verify.isPending || code.length !== 6}
            onPress={() => verify.mutate()}
          />
          <Button
            title="Change login / request another code"
            disabled={verify.isPending}
            outline
            onPress={() => {
              send.reset();
              verify.reset();
              setCode('');
            }}
          />
        </>
      )}
      {(send.isPending || verify.isPending) && <ConnectionWait />}
      <ErrorBox error={send.error ?? verify.error} />
      <Safety />
    </Page>
  );
}
