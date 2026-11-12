import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, thumbUrl } from '../../src/api';
import { Item, User } from '../../src/types';
import {
  Button,
  C,
  Chips,
  Empty,
  ErrorBox,
  Field,
  Loading,
  Page,
  T,
  Title,
  categories,
  money,
} from '../../src/ui';
import { countryOf } from '../../src/countries';
import { useScreenActive } from '../../src/useScreenActive';
export default function Browse() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('ALL');
  const [trade, setTrade] = useState('all');
  const [sort, setSort] = useState('new');
  const active = useScreenActive();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/me') });
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const browse = useInfiniteQuery({
    queryKey: [
      'browse',
      me.data?.country,
      me.data?.latitude,
      me.data?.longitude,
      q,
      category,
      trade,
      sort,
    ],
    enabled: active && !!me.data,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ q, trade, sort, offset: String(pageParam) });
      if (category !== 'ALL') params.set('category', category);
      return api<{ items: Item[]; nextOffset: number | null }>(
        `/browse?${params}`,
        'GET',
        undefined,
        { signal },
      );
    },
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  const items = Array.from(
    new Map(
      browse.data?.pages.flatMap((page) => page.items).map((item) => [item.id, item]),
    ).values(),
  );
  return (
    <Page scroll={false}>
      <Title>Browse</Title>
      <T style={{ color: C.muted }}>
        {countryOf(me.data?.country).name} · Includes finds you swiped past.
      </T>
      <Field
        label="Search listings"
        placeholder="What are you looking for?"
        value={search}
        onChangeText={setSearch}
        maxLength={60}
      />
      <View>
        <Chips values={['ALL', ...categories]} value={category} onChange={setCategory} />
      </View>
      <View>
        <Chips values={['all', 'sell', 'swap']} value={trade} onChange={setTrade} />
      </View>
      <View>
        <Chips
          values={['new', 'near', 'price_low', 'price_high']}
          labels={{ new: 'Newest', near: 'Nearest', price_low: 'Price ↑', price_high: 'Price ↓' }}
          value={sort}
          onChange={setSort}
        />
      </View>
      <ErrorBox
        error={me.error ?? browse.error}
        retry={() => {
          void me.refetch();
          void browse.refetch();
        }}
      />
      <FlatList
        style={{ flex: 1 }}
        data={items}
        numColumns={2}
        keyExtractor={(item) => item.id}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ gap: 12, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (browse.hasNextPage && !browse.isFetching && !browse.isFetchNextPageError)
            void browse.fetchNextPage();
        }}
        ListEmptyComponent={
          !me.error && browse.isPending ? (
            <Loading />
          ) : !browse.error ? (
            <Empty title="No finds yet." body="Try another search or category." />
          ) : null
        }
        ListFooterComponent={
          browse.isFetchingNextPage ? (
            <Loading />
          ) : browse.hasNextPage ? (
            <Button title="Load more" outline onPress={() => void browse.fetchNextPage()} />
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View ${item.title}`}
            onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
            style={{
              flex: 1,
              maxWidth: '50%',
              backgroundColor: 'white',
              borderRadius: 16,
              overflow: 'hidden',
            }}
          >
            <Image
              source={thumbUrl(item.photos[0])}
              style={{ width: '100%', aspectRatio: 1 }}
              contentFit="cover"
            />
            <View style={{ padding: 10, gap: 5 }}>
              <T style={{ color: C.brand }}>
                {item.sell
                  ? money(item.price, item.currency)
                  : `Swap · ${money(item.swapValue, item.currency)}`}
              </T>
              <T numberOfLines={2}>{item.title}</T>
              <T style={{ fontSize: 12, color: C.muted }}>
                {item.area}
                {item.distanceKm != null ? ` · ${item.distanceKm} km` : ''}
              </T>
            </View>
          </Pressable>
        )}
      />
    </Page>
  );
}
