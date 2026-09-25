import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api, thumbUrl } from '../src/api';
import { Conversation } from '../src/types';
import { Button, C, ErrorBox, Page, T } from '../src/ui';
export default function Match() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({
    queryKey: ['chat', id],
    queryFn: () => api<{ conversation: Conversation }>(`/conversations/${id}/messages`),
  });
  return (
    <Page>
      <View style={{ minHeight: 550, justifyContent: 'center', alignItems: 'center', gap: 28 }}>
        <T style={{ fontSize: 55, color: C.mango }}>✦ ↔ ✦</T>
        <T
          style={{
            fontSize: 47,
            fontFamily: 'BricolageGrotesque_700Bold',
            color: C.pink,
            textAlign: 'center',
            letterSpacing: -2,
          }}
        >
          It’s a Havana{'\n'}Match!
        </T>
        <T style={{ textAlign: 'center', color: C.muted }}>
          Their good thing. Your good thing.{'\n'}Looks like you’ve got a deal to make.
        </T>
        <View style={{ flexDirection: 'row', gap: 15 }}>
          {[q.data?.conversation.item, q.data?.conversation.swapItem].map(
            (item, i) =>
              item && (
                <Image
                  key={item.id}
                  source={thumbUrl(item.photos[0])}
                  style={{
                    width: 140,
                    height: 175,
                    borderRadius: 22,
                    transform: [{ rotate: i ? '8deg' : '-8deg' }],
                  }}
                />
              ),
          )}
        </View>
      </View>
      <ErrorBox error={q.error} />
      <Button
        title="Say hello & swap →"
        color={C.pink}
        onPress={() => router.replace({ pathname: '/chat/[id]', params: { id } })}
      />
      <Button title="Keep discovering" outline onPress={() => router.replace('/(tabs)')} />
    </Page>
  );
}
