import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useScreenActive } from '../../src/useScreenActive';
import { api, photoUrl } from '../../src/api';
import { Conversation, User } from '../../src/types';
import { C, Empty, ErrorBox, Loading, Page, T, Title, s } from '../../src/ui';
export default function Inbox() {
  const active = useScreenActive();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/me') });
  const inbox = useQuery({
    queryKey: ['inbox'],
    queryFn: () => api<Conversation[]>('/conversations'),
    enabled: active,
    refetchInterval: active ? 3000 : false,
  });
  const matches = inbox.data?.filter((c) => c.swapItem && !c.completedAt) ?? [];
  const open = (id: string) => router.push({ pathname: '/chat/[id]', params: { id } });
  return (
    <Page>
      <T style={{ color: C.pink, fontSize: 12, letterSpacing: 2 }}>
        A LITTLE HELLO GOES A LONG WAY
      </T>
      <Title>Your people.</Title>
      <ErrorBox error={inbox.error} retry={() => void inbox.refetch()} />
      {inbox.isPending && <Loading />}
      {matches.length > 0 && (
        <>
          <T>
            Swap matches <T style={{ color: C.pink }}>({matches.length})</T>
          </T>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 15 }}
          >
            {matches.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => open(c.id)}
                style={{ alignItems: 'center', width: 90, gap: 7 }}
              >
                <Image
                  source={photoUrl(c.item.photos[0])}
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 25,
                    borderWidth: 3,
                    borderColor: C.pink,
                  }}
                />
                <T numberOfLines={1} style={{ fontSize: 12 }}>
                  {c.buyerId === me.data?.id ? c.seller.name : c.buyer.name}
                </T>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}
      <T style={{ color: C.muted }}>CONVERSATIONS</T>
      {inbox.data?.map((c) => (
        <Pressable key={c.id} style={s.row} onPress={() => open(c.id)}>
          <Image
            source={photoUrl(c.item.photos[0])}
            style={{ width: 65, height: 65, borderRadius: 17 }}
          />
          <View style={{ flex: 1, gap: 5 }}>
            <View style={s.split}>
              <T style={{ fontFamily: 'BricolageGrotesque_700Bold' }}>
                {c.buyerId === me.data?.id ? c.seller.name : c.buyer.name}
              </T>
              {c.swapItem && <T style={{ color: C.pink, fontSize: 11 }}>↔ SWAP</T>}
            </View>
            <T style={{ fontSize: 12, color: C.brand }} numberOfLines={1}>
              {c.item.title}
            </T>
            <T numberOfLines={1} style={{ color: C.muted, fontSize: 12 }}>
              {c.messages?.[0]?.type === 'OFFER'
                ? `Offer · GH₵${c.messages[0].amount}`
                : (c.messages?.[0]?.text ?? 'Say hello!')}
            </T>
          </View>
        </Pressable>
      ))}
      {inbox.data?.length === 0 && (
        <Empty
          title="Good deals start with a hello."
          body="Make an offer in Shop or find a match in Swap. Your conversations will appear here."
        />
      )}
    </Page>
  );
}
