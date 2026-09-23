import React, { useEffect, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { ApiError, api, photoUrl } from '../../src/api';
import { Image } from 'expo-image';
import { Conversation, Item, Mode } from '../../src/types';
import { Button, C, Chips, Empty, ErrorBox, Loading, Page, T, categories, s } from '../../src/ui';
import { useScreenActive } from '../../src/useScreenActive';
import { SwipeCard } from '../../src/SwipeCard';
export default function Discover() {
  const compact = useWindowDimensions().height < 740;
  const active = useScreenActive();
  const [mode, setMode] = useState<Mode>('SHOP'),
    [category, setCategory] = useState('ALL');
  const [location, setLocation] = useState<{ latitude: number; longitude: number }>();
  const [locationError, setLocationError] = useState('');
  const cache = useQueryClient();
  const key = ['feed', mode, category, location];
  const feed = useQuery({
    queryKey: key,
    enabled: active,
    queryFn: () =>
      api<{ items: Item[]; needsCloset: boolean }>(
        `/feed?mode=${mode}${category !== 'ALL' ? `&category=${category}` : ''}${location ? `&latitude=${location.latitude}&longitude=${location.longitude}` : ''}`,
      ),
  });
  const item = feed.data?.items[0];
  useEffect(() => {
    feed.data?.items.slice(1, 3).forEach((next) => {
      const uri = photoUrl(next.photos[0]);
      if (uri) void Image.prefetch(uri);
    });
  }, [feed.data?.items]);
  const swipe = useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: 'LEFT' | 'RIGHT' | 'UP' }) =>
      api<{ match?: Conversation; conversation?: Conversation }>('/swipes', 'POST', {
        itemId: id,
        mode,
        direction,
      }),
    onMutate: async (variables) => {
      await cache.cancelQueries({ queryKey: key });
      const previous = cache.getQueryData<typeof feed.data>(key);
      cache.setQueryData(key, (old: typeof feed.data) =>
        old
          ? { ...old, items: old.items.filter((candidate) => candidate.id !== variables.id) }
          : old,
      );
      return {
        previous,
        removed: previous?.items.find((candidate) => candidate.id === variables.id),
      };
    },
    onError: (error, _variables, context) => {
      // A stale listing is safely dropped. Network failures put it back so it can be retried.
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) return;
      if (context?.removed) {
        cache.setQueryData(key, (old: typeof feed.data) =>
          old && !old.items.some((candidate) => candidate.id === context.removed?.id)
            ? { ...old, items: [context.removed, ...old.items] }
            : old,
        );
      }
    },
    onSettled: () => {
      void cache.invalidateQueries({ queryKey: key });
    },
    onSuccess: (data) => {
      void cache.invalidateQueries({ queryKey: ['saved'] });
      void cache.invalidateQueries({ queryKey: ['inbox'] });
      if (data.match) router.push({ pathname: '/match', params: { id: data.match.id } });
      else if (data.conversation)
        router.push({ pathname: '/chat/[id]', params: { id: data.conversation.id, haggle: '1' } });
    },
  });
  async function locate() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationError('Location is off. Showing finds around central Accra.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation(pos.coords);
      setLocationError('');
    } catch {
      setLocationError('Could not find your location. Showing central Accra.');
    }
  }
  return (
    <Page scroll={false} compact={compact}>
      <View style={s.split}>
        <T
          style={{
            fontSize: compact ? 32 : 37,
            letterSpacing: -2,
            fontFamily: 'BricolageGrotesque_700Bold',
            color: C.brand,
          }}
        >
          havana<T style={{ color: C.pink, fontSize: 37 }}>.</T>
        </T>
        <Pressable onPress={() => void locate()}>
          <T style={{ fontSize: 12, color: C.brand }}>
            ⌖ {location ? 'Near you' : 'Accra, Ghana'} ▾
          </T>
        </Pressable>
      </View>
      <View
        style={{ flexDirection: 'row', padding: 5, backgroundColor: '#E8E7F0', borderRadius: 18 }}
      >
        {(['SHOP', 'SWAP'] as const).map((m) => (
          <Pressable
            key={m}
            disabled={swipe.isPending}
            onPress={() => {
              setMode(m);
              swipe.reset();
            }}
            style={{
              flex: 1,
              padding: compact ? 8 : 12,
              backgroundColor: mode === m ? (m === 'SHOP' ? C.mango : C.pink) : 'transparent',
              borderRadius: 14,
            }}
          >
            <T
              style={{
                textAlign: 'center',
                fontFamily: 'BricolageGrotesque_700Bold',
                color: mode === m && m === 'SWAP' ? 'white' : C.brand,
              }}
            >
              {m === 'SHOP' ? '✦ Shop' : '↔ Swap'}
            </T>
          </Pressable>
        ))}
      </View>
      <View>
        <Chips
          values={['ALL', ...categories]}
          value={category}
          onChange={(value) => {
            if (!swipe.isPending) setCategory(value);
          }}
        />
      </View>
      {locationError ? <T style={{ fontSize: 12, color: C.muted }}>{locationError}</T> : null}
      <ErrorBox error={feed.error ?? swipe.error} retry={() => void feed.refetch()} />
      {feed.isPending ? (
        <Loading />
      ) : feed.data?.needsCloset ? (
        <>
          <Empty
            title="Bring something to the swap."
            body="List an item and turn on Open to swaps. Your next favourite thing could be a match away."
          />
          <Button
            title="Build my Swap Closet →"
            color={C.pink}
            onPress={() => router.push('/(tabs)/list')}
          />
        </>
      ) : item ? (
        <>
          <SwipeCard
            key={item.id + mode}
            item={item}
            mode={mode}
            disabled={swipe.isPending}
            onOpen={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
            onSwipe={(direction) => swipe.mutate({ id: item.id, direction })}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14 }}>
            {(
              [
                ['LEFT', '✕', 'Pass', C.muted],
                ...(mode === 'SHOP' ? [['UP', '↑', 'Haggle', C.mango]] : []),
                [
                  'RIGHT',
                  mode === 'SHOP' ? '♥' : '↔',
                  mode === 'SHOP' ? 'Want it' : 'Swap?',
                  mode === 'SHOP' ? C.leaf : C.pink,
                ],
              ] as [string, string, string, string][]
            ).map(([d, icon, title, color]) => (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityLabel={title}
                disabled={swipe.isPending}
                onPress={() =>
                  swipe.mutate({ id: item.id, direction: d as 'LEFT' | 'RIGHT' | 'UP' })
                }
                style={{ alignItems: 'center', gap: 5, opacity: swipe.isPending ? 0.4 : 1 }}
              >
                <View
                  style={{
                    width: compact ? 50 : 62,
                    height: compact ? 50 : 62,
                    borderRadius: 31,
                    backgroundColor: color === C.muted ? 'white' : color,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <T
                    style={{
                      fontSize: 30,
                      color: color === C.muted ? C.muted : color === C.mango ? C.brand : 'white',
                    }}
                  >
                    {icon}
                  </T>
                </View>
                <T style={{ fontSize: 11, color: C.muted }}>{title}</T>
              </Pressable>
            ))}
          </View>
          {!compact && (
            <T style={{ textAlign: 'center', fontSize: 11, color: C.muted }}>
              Swipe to find your next good thing. Tap to take a closer look.
            </T>
          )}
        </>
      ) : (
        <>
          <Empty
            title="You’re all caught up."
            body="Try another category or check back for fresh finds from your neighbours."
          />
          <Button title="Check for new finds" outline onPress={() => void feed.refetch()} />
        </>
      )}
    </Page>
  );
}
