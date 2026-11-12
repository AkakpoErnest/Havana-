import React, { useCallback, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../src/api';
import { withDeadline } from '../../src/deadline';
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
import { COUNTRY_CODES, COUNTRY_LABELS, countryOf } from '../../src/countries';
export default function Profile() {
  const session = useSession(),
    cache = useQueryClient();
  const [sheet, setSheet] = useState<string | null>(null);
  const [tab, setTab] = useState('MY ITEMS'),
    [name, setName] = useState(''),
    [area, setArea] = useState(''),
    [selected, setSelected] = useState<Item | null>(null),
    [locationError, setLocationError] = useState<Error | null>(null),
    [locating, setLocating] = useState(false);
  useFocusEffect(
    useCallback(
      () => () => {
        setSheet(null);
        setSelected(null);
      },
      [],
    ),
  );
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/me') });
  const saved = useQuery({ queryKey: ['saved'], queryFn: () => api<Item[]>('/saved') });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/items/${id}/status`, 'PATCH', { status }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['me'] });
      void cache.invalidateQueries({ queryKey: ['feed'] });
      void cache.invalidateQueries({ queryKey: ['browse'] });
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
      setSheet(null);
      void cache.invalidateQueries({ queryKey: ['feed'] });
      void cache.invalidateQueries({ queryKey: ['browse'] });
    },
  });
  async function saveLocation() {
    setLocating(true);
    try {
      setLocationError(null);
      const coordinates = await withDeadline(
        async () => {
          if (Platform.OS === 'web') {
            if (!globalThis.navigator?.geolocation)
              throw new Error(
                'Location is unavailable in this browser. You can still set your area.',
              );
            return new Promise<GeolocationPosition>((resolve, reject) =>
              navigator.geolocation.getCurrentPosition(
                resolve,
                () =>
                  reject(
                    new Error(
                      'Could not get your location. Allow location access in your browser or set your area.',
                    ),
                  ),
                { timeout: 15_000, maximumAge: 60_000 },
              ),
            );
          }
          const permission = await Location.requestForegroundPermissionsAsync();
          if (!permission.granted)
            throw new Error('Allow location access to save your nearby-finds preference.');
          return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        },
        20_000,
        'Location took too long. Please try again or set your area.',
      );
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
      <T style={{ color: C.leaf, fontSize: 12, letterSpacing: 2 }}>
        YOUR LITTLE CORNER OF THE MARKET
      </T>
      <Title>{me.data?.name ?? 'Hey, neighbour.'}</Title>
      {me.isPending && <Loading />}
      <T style={{ color: C.muted }}>
        ★ {me.data?.rating?.toFixed(1) ?? 'New here'} · {me.data?.ratingCount ?? 0} ratings
      </T>
      {[
        ['Country', `${countryOf(me.data?.country).flag} ${countryOf(me.data?.country).name}`],
        ['Name', me.data?.name ?? ''],
        ['Area', me.data?.area ?? 'Set your area'],
        ['Saved location', me.data?.latitude != null ? 'Location saved' : 'Use your location'],
        ['Backup login', 'Manage'],
        ['My listings', String(me.data?.items.length ?? 0)],
        ['Saved items', 'Your favourites'],
        ...(me.data?.isAdmin ? [['Review reports', 'Admin']] : []),
        ['Delete account', ''],
        ['Log out', ''],
      ].map(([title, detail]) => (
        <Pressable
          key={title}
          accessibilityRole="button"
          disabled={logout.isPending || !me.data}
          onPress={() => {
            profile.reset();
            setLocationError(null);
            if (title === 'Backup login') router.push('/backup');
            else if (title === 'Review reports') router.push('/moderation');
            else if (title === 'Delete account') setConfirmDelete(true);
            else if (title === 'Log out') logout.mutate();
            else {
              if (title === 'Name') setName(me.data?.name ?? '');
              if (title === 'Area') setArea(me.data?.area ?? '');
              if (title === 'Saved items') setTab('SAVED');
              if (title === 'My listings') setTab('MY ITEMS');
              setSheet(title);
            }
          }}
          style={[
            s.split,
            { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: C.line },
          ]}
        >
          <T>{title}</T>
          <T style={{ color: C.muted }}>{detail} ›</T>
        </Pressable>
      ))}
      <ErrorBox error={me.error ?? logout.error} retry={() => void me.refetch()} />
      <Modal
        visible={!!sheet}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!profile.isPending && !locating && !update.isPending) {
            setSheet(null);
            setSelected(null);
          }
        }}
      >
        <View
          style={{ flex: 1, backgroundColor: '#16152E88', justifyContent: 'center', padding: 20 }}
        >
          <ScrollView
            automaticallyAdjustKeyboardInsets
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          >
            <View style={s.box}>
              {selected ? (
                <>
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
                </>
              ) : (
                <>
                  <Title>{sheet}</Title>
                  {sheet === 'Country' && (
                    <>
                      <T style={{ color: C.muted, fontSize: 13 }}>
                        Your country sets your currency and which listings you see.
                      </T>
                      <Chips
                        values={COUNTRY_CODES}
                        labels={COUNTRY_LABELS}
                        value={me.data?.country ?? 'GH'}
                        disabled={profile.isPending || !me.data}
                        onChange={(country) => {
                          if (country !== me.data?.country) profile.mutate({ country });
                        }}
                      />
                    </>
                  )}
                  {sheet === 'Name' && (
                    <Field
                      label="Your name"
                      value={name}
                      onChangeText={setName}
                      maxLength={60}
                      editable={!profile.isPending}
                    />
                  )}
                  {sheet === 'Area' && (
                    <Field
                      label="Your area"
                      value={area}
                      onChangeText={setArea}
                      maxLength={80}
                      editable={!profile.isPending}
                    />
                  )}
                  {(sheet === 'Name' || sheet === 'Area') && (
                    <Button
                      title={profile.isPending ? 'Saving…' : 'Save'}
                      disabled={
                        profile.isPending ||
                        (sheet === 'Name' ? name.trim().length < 2 : area.trim().length < 2)
                      }
                      onPress={() =>
                        profile.mutate(
                          sheet === 'Name' ? { name: name.trim() } : { area: area.trim() },
                        )
                      }
                    />
                  )}
                  {sheet === 'Saved location' && (
                    <>
                      <T>
                        Use your device location for nearby finds. In a browser, allow location
                        access when prompted.
                      </T>
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
                    </>
                  )}
                  {(sheet === 'My listings' || sheet === 'Saved items') && (
                    <>
                      <Chips
                        values={['MY ITEMS', 'SWAP CLOSET', 'SAVED']}
                        value={tab}
                        onChange={setTab}
                      />
                      <T style={s.label}>Open an item or update its status below.</T>
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
                            onLongPress={
                              item.ownerId === me.data?.id ? () => change(item) : undefined
                            }
                          />
                          {item.ownerId === me.data?.id && (
                            <Button title="Update status" outline onPress={() => change(item)} />
                          )}
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
                          title={
                            tab === 'SAVED' ? 'Save a little something.' : 'Room for a good find.'
                          }
                          body={
                            tab === 'SAVED'
                              ? 'Swipe right in Shop and your favourites will be here.'
                              : 'List something you no longer use. Someone nearby is looking for it.'
                          }
                        />
                      )}
                    </>
                  )}
                </>
              )}
              <ErrorBox error={profile.error ?? locationError ?? update.error} />
              <Button
                title="Close"
                outline
                disabled={profile.isPending || locating || update.isPending}
                onPress={() => {
                  setSheet(null);
                  setSelected(null);
                }}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>
      <Safety />
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
