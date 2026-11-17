import React, { useEffect, useState } from 'react';
import { Keyboard, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { LegalLink } from '../src/LegalLink';
import { api } from '../src/api';
import { useSession } from '../src/session';
import { LoginType, useLoginMethods } from '../src/login-methods';
import {
  COUNTRIES,
  COUNTRY_CODES,
  COUNTRY_LABELS,
  CountryCode,
  guessCountry,
} from '../src/countries';
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
    [code, setCode] = useState(''),
    [country, setCountry] = useState<CountryCode>(guessCountry);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  const { offered, methods } = useLoginMethods();
  // Fall back to an offered type (e.g. EMAIL while phone login waits for SMS).
  const type = offered.includes(chosen) ? chosen : (offered[0] ?? chosen);
  const session = useSession();
  const send = useMutation({
    mutationFn: () =>
      api<{ challengeId: string; devCode?: string }>('/auth/request', 'POST', {
        type,
        value: value.trim(),
        country,
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
    <Page avoidKeyboard>
      <View style={{ paddingVertical: keyboardVisible ? 8 : 35, gap: 14 }}>
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
        {!keyboardVisible && (
          <>
            <T style={{ color: C.leaf, fontSize: 12, letterSpacing: 3 }}>
              NEW & PRE-LOVED · AFRICA’S SWEET SPOT
            </T>
            <Title>Good things.{'\n'}New stories.</Title>
            <T style={{ color: C.muted, lineHeight: 24 }}>
              Buy it. Haggle a little. Swap for something you love.
            </T>
          </>
        )}
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
          {offered.length > 0 && (
            <>
              <Chips
                values={COUNTRY_CODES}
                labels={COUNTRY_LABELS}
                value={country}
                onChange={(next) => setCountry(next as CountryCode)}
                disabled={send.isPending}
              />
              <Field
                label={
                  type === 'PHONE' ? `Your ${COUNTRIES[country].name} phone number` : 'Your email'
                }
                value={value}
                onChangeText={setValue}
                editable={!send.isPending}
                keyboardType={type === 'PHONE' ? 'phone-pad' : 'email-address'}
                autoCapitalize="none"
                returnKeyType="send"
                onSubmitEditing={() => {
                  if (offered.length && value.trim() && !send.isPending) send.mutate();
                }}
                autoCorrect={false}
                autoComplete={type === 'PHONE' ? 'tel' : 'email'}
                placeholder={type === 'PHONE' ? COUNTRIES[country].example : 'you@example.com'}
              />
              <Button
                title={send.isPending ? 'Sending…' : 'Send my code →'}
                disabled={send.isPending || !value.trim()}
                onPress={() => send.mutate()}
              />
            </>
          )}
          {methods.isPending && <T>Checking available login methods…</T>}
          {methods.isSuccess && offered.length === 0 && (
            <T>Sign-in is unavailable right now. Please try again later.</T>
          )}
          <ErrorBox error={methods.error} retry={() => void methods.refetch()} />
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
            returnKeyType="go"
            onSubmitEditing={() => {
              if (code.length === 6 && !verify.isPending) verify.mutate();
            }}
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
      <T style={{ color: C.muted, fontSize: 12 }}>
        By continuing you agree to the <LegalLink path="/rules">Community rules</LegalLink> and{' '}
        <LegalLink path="/privacy">Privacy policy</LegalLink>
      </T>
      <Safety />
    </Page>
  );
}
