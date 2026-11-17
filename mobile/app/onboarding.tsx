import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../src/api';
import { User } from '../src/types';
import { Button, ErrorBox, Field, Page, T, Title } from '../src/ui';
import { LegalLink } from '../src/LegalLink';
import { countryOf } from '../src/countries';

export default function Onboarding() {
  const cache = useQueryClient();
  const [name, setName] = useState(() => {
    const saved = cache.getQueryData<User>(['me'])?.name;
    return saved === 'Havana neighbour' ? '' : (saved ?? '');
  });
  const [accepted, setAccepted] = useState(false);
  const [area, setArea] = useState(() => cache.getQueryData<User>(['me'])?.area ?? '');
  const home = countryOf(cache.getQueryData<User>(['me'])?.country);
  const save = useMutation({
    mutationFn: () =>
      api<User>('/me', 'PATCH', { name: name.trim(), area: area.trim(), acceptTerms: true }),
    onSuccess: (user) => {
      cache.setQueryData(['me'], user);
      void cache.invalidateQueries({ queryKey: ['feed'] });
    },
  });
  const valid =
    accepted &&
    name.trim().length >= 2 &&
    name.trim() !== 'Havana neighbour' &&
    area.trim().length >= 2;
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Page>
        <Title>What should we call you?</Title>
        <T>
          Your name and area help neighbours get to know who they’re trading with. You can change
          them later under You.
        </T>
        <Field
          label="Your name"
          value={name}
          onChangeText={setName}
          maxLength={60}
          autoCapitalize="words"
          placeholder="e.g. Ama"
          editable={!save.isPending}
        />
        <Field
          label={`Your area in ${home.name}`}
          value={area}
          onChangeText={setArea}
          maxLength={80}
          autoCapitalize="words"
          placeholder={`e.g. ${home.areas.split(',')[0]}`}
          editable={!save.isPending}
        />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted, disabled: save.isPending }}
          disabled={save.isPending}
          onPress={() => setAccepted((value) => !value)}
          style={{ paddingVertical: 12 }}
        >
          <T>{accepted ? '☑' : '☐'} I&apos;m 18 or older and agree to the Community rules</T>
        </Pressable>
        <LegalLink path="/rules">Read the Community rules</LegalLink>
        <Button
          title={save.isPending ? 'Saving…' : 'Explore Havana →'}
          disabled={!valid || save.isPending}
          onPress={() => save.mutate()}
        />
        <ErrorBox error={save.error} />
      </Page>
    </KeyboardAvoidingView>
  );
}
