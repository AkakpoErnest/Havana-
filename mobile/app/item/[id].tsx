import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, photoUrl } from '../../src/api';
import { Conversation, Item, User } from '../../src/types';
import {
  Button,
  C,
  ErrorBox,
  Field,
  Loading,
  Page,
  Safety,
  T,
  Title,
  label,
  money,
  s,
} from '../../src/ui';
export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cache = useQueryClient();
  const [reporting, setReporting] = useState(false),
    [reason, setReason] = useState('');
  const query = useQuery({ queryKey: ['item', id], queryFn: () => api<Item>(`/items/${id}`) });
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/me') });
  const chat = useMutation({
    mutationFn: () => api<Conversation>('/conversations', 'POST', { itemId: id }),
    onSuccess: (c) => router.push({ pathname: '/chat/[id]', params: { id: c.id, haggle: '1' } }),
  });
  const swap = useMutation({
    mutationFn: () =>
      api<{ match?: Conversation }>('/swipes', 'POST', {
        itemId: id,
        mode: 'SWAP',
        direction: 'RIGHT',
      }),
    onSuccess: (r) => {
      void cache.invalidateQueries({ queryKey: ['feed'] });
      if (r.match) router.push({ pathname: '/match', params: { id: r.match.id } });
    },
  });
  const report = useMutation({
    mutationFn: () => api(`/items/${id}/report`, 'POST', { reason }),
    onSuccess: () => {
      setReporting(false);
      void cache.invalidateQueries({ queryKey: ['feed'] });
    },
  });
  const item = query.data;
  if (!item)
    return (
      <Page>
        <Loading />
        <ErrorBox error={query.error} retry={() => void query.refetch()} />
      </Page>
    );
  const own = item.ownerId === me.data?.id,
    available = item.status === 'LIVE' && !item.hidden;
  return (
    <Page>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
        {item.photos.map((p) => (
          <Image
            key={p}
            source={photoUrl(p)}
            style={{ width: 310, height: 340, borderRadius: 24, marginRight: 10 }}
            contentFit="cover"
          />
        ))}
      </ScrollView>
      <View style={s.split}>
        <T style={{ color: C.muted, fontSize: 12 }}>
          {label(item.category)} · {label(item.condition)}
        </T>
        <T style={{ color: C.leaf }}>{label(item.status)}</T>
      </View>
      <Title>{item.title}</Title>
      <View style={s.split}>
        {item.sell && <T style={{ fontSize: 27, color: C.brand }}>{money(item.price)}</T>}
        {item.swap && <T style={{ color: C.pink }}>↔ Swap value {money(item.swapValue)}</T>}
      </View>
      <T style={{ color: C.muted }}>⌖ {item.area}, Accra</T>
      <T style={{ lineHeight: 24 }}>{item.description}</T>
      <View style={s.box}>
        <T>{item.owner.name}</T>
        <T style={{ color: C.muted, fontSize: 13 }}>
          ★ {item.owner.rating?.toFixed(1) ?? 'New neighbour'} · {item.owner.ratingCount ?? 0}{' '}
          ratings
        </T>
      </View>
      {!own && available && (
        <>
          {item.sell && (
            <Button
              title="Let’s haggle →"
              color={C.mango}
              disabled={chat.isPending}
              onPress={() => chat.mutate()}
            />
          )}
          {item.swap && (
            <Button
              title={swap.isSuccess ? 'Swap interest sent ✓' : 'I’d swap for this ↔'}
              color={C.pink}
              disabled={swap.isPending || swap.isSuccess}
              onPress={() => swap.mutate()}
            />
          )}
        </>
      )}
      <ErrorBox error={chat.error ?? swap.error ?? report.error} />
      <Safety />
      {!own && <Button title="Report this item" outline onPress={() => setReporting((v) => !v)} />}
      {reporting && (
        <>
          <Field
            label="What’s wrong with this listing?"
            multiline
            value={reason}
            onChangeText={setReason}
          />
          <Button
            title="Send report"
            disabled={reason.trim().length < 5 || report.isPending}
            onPress={() => report.mutate()}
          />
        </>
      )}
      {report.isSuccess && <T>Thanks. Your report has been recorded.</T>}
    </Page>
  );
}
