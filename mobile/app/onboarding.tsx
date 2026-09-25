import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../src/api';
import { User } from '../src/types';
import { Button, ErrorBox, Field, Page, T, Title } from '../src/ui';

export default function Onboarding() {
  const cache = useQueryClient();
  const [name, setName] = useState('');
  const [area, setArea] = useState(() => cache.getQueryData<User>(['me'])?.area ?? '');
  const save = useMutation({
    mutationFn: () => api<User>('/me', 'PATCH', { name: name.trim(), area: area.trim() }),
    onSuccess: (user) => {
      cache.setQueryData(['me'], user);
      void cache.invalidateQueries({ queryKey: ['feed'] });
    },
  });
  const valid =
    name.trim().length >= 2 && name.trim() !== 'Havana neighbour' && area.trim().length >= 2;
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
          label="Your area in Accra"
          value={area}
          onChangeText={setArea}
          maxLength={80}
          autoCapitalize="words"
          placeholder="e.g. Osu"
          editable={!save.isPending}
        />
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
