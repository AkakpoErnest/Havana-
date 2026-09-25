import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../src/api';
import { User } from '../src/types';
import { Button, Chips, ConnectionWait, ErrorBox, Field, Page, T, Title } from '../src/ui';
export default function Backup() {
  const [type, setType] = useState('EMAIL'),
    [value, setValue] = useState(''),
    [code, setCode] = useState('');
  const cache = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/me') });
  const send = useMutation({
    mutationFn: () =>
      api<{ challengeId: string; devCode?: string }>('/auth/link/request', 'POST', {
        type,
        value: value.trim(),
      }),
  });
  const verify = useMutation({
    mutationFn: () =>
      api('/auth/link/verify', 'POST', { challengeId: send.data?.challengeId, code }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['me'] });
      send.reset();
      setCode('');
      setValue('');
    },
  });
  return (
    <Page>
      <Title>One account.{'\n'}Two ways in.</Title>
      <T>
        Verify a backup email or phone. Either login opens the same Havana account on both phones.
      </T>
      {me.data?.identities.map((i) => (
        <T key={i.type}>
          ✓ {i.type.toLowerCase()}: {i.value}
        </T>
      ))}
      {me.data?.identities.length === 2 ? (
        <T>You’re covered — both login methods are attached.</T>
      ) : !send.data ? (
        <>
          <Chips
            values={['EMAIL', 'PHONE']}
            value={type}
            onChange={setType}
            disabled={send.isPending}
          />
          <Field
            label="Backup login"
            value={value}
            onChangeText={setValue}
            editable={!send.isPending}
            autoCapitalize="none"
            keyboardType={type === 'PHONE' ? 'phone-pad' : 'email-address'}
          />
          <Button
            title="Send verification code"
            disabled={send.isPending || !value.trim()}
            onPress={() => send.mutate()}
          />
        </>
      ) : (
        <>
          {send.data.devCode && <T>Development code: {send.data.devCode}</T>}
          <Field
            label="6-digit code"
            value={code}
            onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
            editable={!verify.isPending}
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="one-time-code"
          />
          <Button
            title="Verify & link"
            disabled={verify.isPending || code.length !== 6}
            onPress={() => verify.mutate()}
          />
          <Button
            title="Start again"
            outline
            disabled={verify.isPending}
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
      {verify.isSuccess && <T>Backup login linked successfully.</T>}
    </Page>
  );
}
