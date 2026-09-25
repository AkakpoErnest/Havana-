import React, { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../src/api';
import * as Location from 'expo-location';
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
    [area, setArea] = useState(''),
    [selected, setSelected] = useState<Item | null>(null),
    [locationError, setLocationError] = useState<Error | null>(null),
    [locating, setLocating] = useState(false);
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
  const profile = useMutation({
    mutationFn: (changes: Record<string, unknown>) => api<User>('/me', 'PATCH', changes),
    onSuccess: (user, changes) => {
      if (changes.name !== undefined)
        setName((draft) => (draft.trim() === changes.name ? '' : draft));
      if (changes.area !== undefined)
        setArea((draft) => (draft.trim() === changes.area ? '' : draft));
      cache.setQueryData(['me'], user);
      void cache.invalidateQueries({ queryKey: ['feed'] });
    },
  });
  async function saveLocation() {
    setLocating(true);
    try {
      setLocationError(null);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted)
        throw new Error('Allow location access to save your nearby-finds preference.');
      const coordinates = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await profile.mutateAsync({
        latitude: coordinates.coords.latitude,
        longitude: coordinates.coords.longitude,
      });
    } catch (error) {
      setLocationError(error instanceof Error ? error : new Error('Could not save your location.'));
    } finally {
      setLocating(false);
    }
  }
  const logout = useMutation({ mutationFn: () => session.signOut() });
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Permanent (Google Play requirement). The server ends every session, so sign out right after.
  const deleteAccount = useMutation({
    mutationFn: async () => {
      await api('/me', 'DELETE', { confirm: 'DELETE' });
      await session.signOut();
    },
  });
  const unsave = useMutation({
    mutationFn: (itemId: string) => api(`/saved/${itemId}`, 'DELETE'),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['saved'] });
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
        <Field
          label="Your area in Accra"
          placeholder={me.data?.area ?? 'Osu, Madina, East Legon…'}
          value={area}
          onChangeText={setArea}
          maxLength={80}
        />
        <Button
          title="Save profile"
          outline
          disabled={profile.isPending || locating || (!name.trim() && !area.trim())}
          onPress={() =>
            profile.mutate({
              ...(name.trim() ? { name: name.trim() } : {}),
              ...(area.trim() ? { area: area.trim() } : {}),
            })
          }
        />
        <Button
          title={
            locating
              ? 'Saving your location…'
              : me.data?.latitude != null
                ? 'Update saved location'
                : 'Save nearby-finds location'
          }
          outline
          disabled={profile.isPending || locating}
          onPress={() => void saveLocation()}
        />
      </View>
      <Chips values={['MY ITEMS', 'SWAP CLOSET', 'SAVED']} value={tab} onChange={setTab} />
      <T style={s.label}>Hold one of your items to change its status.</T>
      <ErrorBox
        error={
          me.error ??
          saved.error ??
          update.error ??
          profile.error ??
          unsave.error ??
          locationError ??
          logout.error
        }
        retry={() => {
          void me.refetch();
          void saved.refetch();
        }}
      />
      {items?.map((item) => (
        <View key={item.id} style={{ gap: 6 }}>
          <ItemRow
            item={item}
            onLongPress={item.ownerId === me.data?.id ? () => change(item) : undefined}
          />
          {tab === 'SAVED' && (
            <Button
              title="Remove from saved"
              outline
              disabled={unsave.isPending}
              onPress={() => unsave.mutate(item.id)}
            />
          )}
        </View>
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
      <Button
        title={logout.isPending ? 'Logging out…' : 'Log out'}
        disabled={logout.isPending}
        outline
        onPress={() => logout.mutate()}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => setConfirmDelete(true)}
        style={{ alignSelf: 'center', padding: 8 }}
      >
        <T style={{ color: C.muted, fontSize: 13, textDecorationLine: 'underline' }}>
          Delete account
        </T>
      </Pressable>
      <Modal
        visible={confirmDelete}
        transparent
        animationType="fade"
        onRequestClose={() => !deleteAccount.isPending && setConfirmDelete(false)}
      >
        <View
          style={{ flex: 1, backgroundColor: '#16152E88', justifyContent: 'center', padding: 20 }}
        >
          <View style={s.box}>
            <Title>Delete your account?</Title>
            <T style={{ lineHeight: 22 }}>
              This can’t be undone. Your listings and photos, your chat messages, saved items,
              ratings and your phone/email logins are removed. People you chatted with will see
              “Deleted user”.
            </T>
            <ErrorBox error={deleteAccount.error} />
            <Button
              title={deleteAccount.isPending ? 'Deleting…' : 'Delete forever'}
              color={C.pink}
              disabled={deleteAccount.isPending}
              onPress={() => deleteAccount.mutate()}
            />
            <Button
              title="Keep my account"
              outline
              disabled={deleteAccount.isPending}
              onPress={() => setConfirmDelete(false)}
            />
          </View>
        </View>
      </Modal>
    </Page>
  );
}
