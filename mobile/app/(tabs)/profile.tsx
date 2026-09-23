import React, { useState } from 'react';
import { Modal, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../src/api';
import { Item, User } from '../../src/types';
import { useSession } from '../../src/session';
import {
  Button,
  C,
  Chips,
  Empty,
  ErrorBox,
  Field,
  ItemRow,
  Loading,
  Page,
  Safety,
  T,
  Title,
  s,
} from '../../src/ui';
export default function Profile() {
  const session = useSession(),
    cache = useQueryClient();
  const [tab, setTab] = useState('MY ITEMS'),
    [name, setName] = useState(''),
    [selected, setSelected] = useState<Item | null>(null);
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/me') });
  const saved = useQuery({ queryKey: ['saved'], queryFn: () => api<Item[]>('/saved') });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/items/${id}/status`, 'PATCH', { status }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['me'] });
      void cache.invalidateQueries({ queryKey: ['feed'] });
    },
  });
  const rename = useMutation({
    mutationFn: () => api('/me', 'PATCH', { name: name.trim() }),
    onSuccess: () => {
      setName('');
      void cache.invalidateQueries({ queryKey: ['me'] });
    },
  });
  function change(item: Item) {
    setSelected(item);
  }
  const items =
    tab === 'SAVED'
      ? saved.data
      : me.data?.items.filter(
          (i) => tab !== 'SWAP CLOSET' || (i.swap && i.status === 'LIVE' && !i.hidden),
        );
  return (
    <Page>
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <View
          style={{ flex: 1, backgroundColor: '#16152E88', justifyContent: 'flex-end', padding: 20 }}
        >
          <View style={s.box}>
            <Title>Update status</Title>
            <T>{selected?.title}</T>
            {['LIVE', 'RESERVED', 'SOLD', 'REMOVED'].map((status) => (
              <Button
                key={status}
                title={status.toLowerCase()}
                disabled={update.isPending}
                onPress={() => {
                  if (selected) update.mutate({ id: selected.id, status });
                  setSelected(null);
                }}
                outline
              />
            ))}
            <T>Complete swaps together in the match chat.</T>
            <Button title="Cancel" onPress={() => setSelected(null)} />
          </View>
        </View>
      </Modal>
      <T style={{ color: C.leaf, fontSize: 12, letterSpacing: 2 }}>
        YOUR LITTLE CORNER OF THE MARKET
      </T>
      <Title>{me.data?.name ?? 'Hey, neighbour.'}</Title>
      {me.isPending && <Loading />}
      <T style={{ color: C.muted }}>
        ★ {me.data?.rating?.toFixed(1) ?? 'New here'} · {me.data?.ratingCount ?? 0} ratings
      </T>
      <View style={s.box}>
        <Field
          label="What should people call you?"
          placeholder={me.data?.name}
          value={name}
          onChangeText={setName}
          maxLength={60}
        />
        <Button
          title="Update name"
          outline
          disabled={name.trim().length < 2 || rename.isPending}
          onPress={() => rename.mutate()}
        />
      </View>
      <Chips values={['MY ITEMS', 'SWAP CLOSET', 'SAVED']} value={tab} onChange={setTab} />
      <T style={s.label}>Hold one of your items to change its status.</T>
      <ErrorBox
        error={me.error ?? saved.error ?? update.error ?? rename.error}
        retry={() => {
          void me.refetch();
          void saved.refetch();
        }}
      />
      {items?.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          onLongPress={item.ownerId === me.data?.id ? () => change(item) : undefined}
        />
      ))}
      {items?.length === 0 && (
        <Empty
          title={tab === 'SAVED' ? 'Save a little something.' : 'Room for a good find.'}
          body={
            tab === 'SAVED'
              ? 'Swipe right in Shop and your favourites will be here.'
              : 'List something you no longer use. Someone in Accra is looking for it.'
          }
        />
      )}
      <Button title="Manage backup login →" outline onPress={() => router.push('/backup')} />
      <Safety />
      <Button title="Log out" outline onPress={() => void session.signOut()} />
    </Page>
  );
}
