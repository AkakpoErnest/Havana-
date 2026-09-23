import React, { useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, photoUrl } from '../../src/api';
import { ChatData, mergeHistory, mergeLatest } from '../../src/chat-cache';
import { useScreenActive } from '../../src/useScreenActive';
import { Message, User } from '../../src/types';
import { Button, C, ErrorBox, Field, Loading, Page, T, money, s } from '../../src/ui';
export default function ChatScreen() {
  const { id, haggle } = useLocalSearchParams<{ id: string; haggle?: string }>();
  const [text, setText] = useState(''),
    [amount, setAmount] = useState(''),
    [showOffer, setShowOffer] = useState(haggle === '1'),
    [rating, setRating] = useState(0);
  const scroll = useRef<FlatList<Message>>(null);
  const stickToBottom = useRef(true);
  const cache = useQueryClient();
  const active = useScreenActive();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/me') });
  const q = useQuery({
    queryKey: ['chat', id],
    queryFn: async () => {
      const previous = cache.getQueryData<ChatData>(['chat', id]);
      const path = previous?.cursor
        ? `/conversations/${id}/messages?since=${encodeURIComponent(previous.cursor)}`
        : `/conversations/${id}/messages`;
      const incoming = await api<ChatData>(path);
      return mergeLatest(previous, incoming);
    },
    enabled: active,
    refetchInterval: active ? 3000 : false,
  });
  const c = q.data?.conversation;
  const ownId = me.data?.id;
  const buyer = c?.buyerId === ownId;
  const other = buyer ? c?.seller : c?.buyer;
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ['chat', id] });
    void cache.invalidateQueries({ queryKey: ['inbox'] });
    void cache.invalidateQueries({ queryKey: ['me'] });
    void cache.invalidateQueries({ queryKey: ['feed'] });
    void cache.invalidateQueries({ queryKey: ['item'] });
  };
  const send = useMutation({
    mutationFn: (body: string) =>
      api<Message>(`/conversations/${id}/messages`, 'POST', { text: body }),
    onSuccess: (message, sent) => {
      setText((current) => (current === sent ? '' : current));
      stickToBottom.current = true;
      cache.setQueryData<ChatData>(['chat', id], (old) =>
        old ? mergeLatest(old, { ...old, messages: [message] }) : old,
      );
      refresh();
    },
  });
  const offer = useMutation({
    mutationFn: () => {
      if (!/^[1-9]\d*$/.test(amount)) throw new Error('Enter a positive whole-cedi amount.');
      return api(`/conversations/${id}/offers`, 'POST', { amount: Number(amount) });
    },
    onSuccess: () => {
      setAmount('');
      setShowOffer(false);
      refresh();
    },
  });
  const respond = useMutation({
    mutationFn: ({ messageId, action }: { messageId: string; action: 'ACCEPT' | 'DECLINE' }) =>
      api(`/conversations/${id}/offers/${messageId}`, 'POST', { action }),
    onSuccess: refresh,
  });
  const swap = useMutation({
    mutationFn: (action: 'AGREE' | 'DONE') => api(`/conversations/${id}/swap`, 'POST', { action }),
    onSuccess: refresh,
  });
  const rate = useMutation({
    mutationFn: (stars: number) => api('/ratings', 'POST', { toId: other?.id, stars }),
    onSuccess: (_, stars) => {
      setRating(stars);
      refresh();
    },
  });
  const history = useMutation({
    mutationFn: () =>
      api<ChatData>(
        `/conversations/${id}/messages?before=${encodeURIComponent(q.data?.messages[0]?.createdAt ?? '')}`,
      ),
    onSuccess: (data) =>
      cache.setQueryData<ChatData>(['chat', id], (current) =>
        current ? mergeHistory(current, data) : data,
      ),
  });
  const messages = q.data?.messages ?? [];
  if (!c)
    return (
      <Page>
        {q.isPending && <Loading />}
        <ErrorBox error={q.error} retry={() => void q.refetch()} />
      </Page>
    );
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Page scroll={false}>
        <View style={s.row}>
          <Image
            source={photoUrl(c.item.photos[0])}
            style={{ width: 48, height: 48, borderRadius: 12 }}
          />
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: 'BricolageGrotesque_700Bold' }}>{other?.name}</T>
            <T numberOfLines={1} style={{ fontSize: 12, color: C.muted }}>
              {c.item.title} · {c.swapItem ? 'Swap match' : money(c.item.price)}
            </T>
          </View>
          {c.swapItem && (
            <>
              <T style={{ color: C.pink, fontSize: 23 }}>↔</T>
              <Image
                source={photoUrl(c.swapItem.photos[0])}
                style={{ width: 48, height: 48, borderRadius: 12 }}
              />
            </>
          )}
        </View>
        {c.swapItem && (
          <View style={{ gap: 8 }}>
            <T style={{ fontSize: 12, color: C.pink }}>
              {c.item.title} ↔ {c.swapItem.title}
            </T>
            {c.completedAt ? (
              <T style={{ color: C.leaf }}>✓ Swap done. Two things, two new homes.</T>
            ) : (
              <View style={s.split}>
                <View style={{ flex: 1 }}>
                  <Button
                    title={(buyer ? c.buyerAgreed : c.sellerAgreed) ? 'Agreed ✓' : 'We agreed'}
                    color={C.pink}
                    disabled={swap.isPending || (buyer ? c.buyerAgreed : c.sellerAgreed)}
                    onPress={() => swap.mutate('AGREE')}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title={(buyer ? c.buyerDone : c.sellerDone) ? 'Confirmed ✓' : 'Swap done'}
                    color={C.leaf}
                    disabled={
                      swap.isPending ||
                      !c.buyerAgreed ||
                      !c.sellerAgreed ||
                      (buyer ? c.buyerDone : c.sellerDone)
                    }
                    onPress={() => swap.mutate('DONE')}
                  />
                </View>
              </View>
            )}
            <T style={{ fontSize: 11, color: C.muted }}>
              Both people agree, then both confirm after the handover.
            </T>
          </View>
        )}
        <T style={{ color: C.leaf, fontSize: 11 }}>
          Meet in public · Check before paying · MoMo or cash directly
        </T>
        <ErrorBox
          error={
            q.error ??
            send.error ??
            offer.error ??
            respond.error ??
            swap.error ??
            rate.error ??
            history.error
          }
        />
        <FlatList
          ref={scroll}
          data={messages}
          keyExtractor={(message) => message.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 10, paddingBottom: 12 }}
          initialNumToRender={20}
          windowSize={7}
          keyboardShouldPersistTaps="handled"
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onScroll={(event) => {
            const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
            stickToBottom.current =
              contentSize.height - layoutMeasurement.height - contentOffset.y < 100;
          }}
          scrollEventThrottle={100}
          onContentSizeChange={() => {
            if (stickToBottom.current) scroll.current?.scrollToEnd({ animated: false });
          }}
          ListHeaderComponent={
            q.data?.hasMore ? (
              <Button
                title={history.isPending ? 'Loading…' : 'Load older messages'}
                outline
                disabled={history.isPending}
                onPress={() => {
                  stickToBottom.current = false;
                  history.mutate();
                }}
              />
            ) : null
          }
          renderItem={({ item: m }) =>
            m.type === 'SYSTEM' ? (
              <T
                key={m.id}
                style={{
                  fontSize: 11,
                  color: C.muted,
                  textAlign: 'center',
                  padding: 10,
                  lineHeight: 17,
                }}
              >
                {m.text}
              </T>
            ) : (
              <View
                key={m.id}
                style={{
                  alignSelf: m.senderId === ownId ? 'flex-end' : 'flex-start',
                  maxWidth: '90%',
                  backgroundColor:
                    m.type === 'OFFER' ? '#FFF0D2' : m.senderId === ownId ? C.brand : 'white',
                  padding: 14,
                  borderRadius: 18,
                  gap: 9,
                }}
              >
                {m.type === 'OFFER' ? (
                  <>
                    <T style={{ fontSize: 11, color: C.muted }}>
                      {m.senderId === ownId ? 'YOUR OFFER' : 'THEIR OFFER'} ·{' '}
                      {m.offerStatus?.toLowerCase()}
                    </T>
                    <T style={{ fontSize: 29, fontFamily: 'BricolageGrotesque_700Bold' }}>
                      {money(m.amount)}
                    </T>
                    {m.offerStatus === 'PENDING' && m.senderId !== ownId && (
                      <>
                        <View style={s.split}>
                          <Button
                            title="Accept"
                            color={C.leaf}
                            disabled={respond.isPending}
                            onPress={() => respond.mutate({ messageId: m.id, action: 'ACCEPT' })}
                          />
                          <Button
                            title="Counter"
                            color={C.mango}
                            onPress={() => {
                              setAmount(String(m.amount));
                              setShowOffer(true);
                            }}
                          />
                        </View>
                        <Pressable
                          disabled={respond.isPending}
                          onPress={() => respond.mutate({ messageId: m.id, action: 'DECLINE' })}
                        >
                          <T style={{ textAlign: 'center', color: C.muted, fontSize: 12 }}>
                            Decline offer
                          </T>
                        </Pressable>
                      </>
                    )}
                  </>
                ) : (
                  <T style={{ color: m.senderId === ownId ? 'white' : C.ink, lineHeight: 21 }}>
                    {m.text}
                  </T>
                )}
                <T
                  style={{
                    fontSize: 10,
                    color: m.senderId === ownId && m.type !== 'OFFER' ? '#CECCE9' : C.muted,
                  }}
                >
                  {new Date(m.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </T>
              </View>
            )
          }
        />
        {showOffer && !c.swapItem && (
          <Modal transparent animationType="slide" onRequestClose={() => setShowOffer(false)}>
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: '#16152E88',
                  justifyContent: 'flex-end',
                  padding: 20,
                }}
              >
                <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>
                  <View style={s.box}>
                    <View style={s.split}>
                      <T>Haggle a little</T>
                      <Pressable onPress={() => setShowOffer(false)}>
                        <T>✕</T>
                      </Pressable>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {[1, 0.9, 0.8, 0.7].map((f) => (
                        <Pressable
                          key={f}
                          onPress={() =>
                            setAmount(String(Math.max(1, Math.round((c.item.price ?? 0) * f))))
                          }
                          style={{
                            flex: 1,
                            backgroundColor: '#FFF0D2',
                            padding: 8,
                            borderRadius: 12,
                          }}
                        >
                          <T style={{ fontSize: 12, textAlign: 'center' }}>
                            {f === 1 ? 'Asking' : `−${Math.round((1 - f) * 100)}%`}
                          </T>
                        </Pressable>
                      ))}
                    </View>
                    <Field
                      label="Your offer · GH₵"
                      value={amount}
                      onChangeText={setAmount}
                      keyboardType="number-pad"
                    />
                    <Button
                      title="Send offer"
                      color={C.mango}
                      disabled={offer.isPending || !amount}
                      onPress={() => offer.mutate()}
                    />
                    <ErrorBox error={offer.error} />
                  </View>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Field
              label="Message"
              placeholder="Say hello…"
              value={text}
              onChangeText={setText}
              maxLength={2000}
            />
          </View>
          <Button
            title="Send"
            disabled={!text.trim() || send.isPending}
            onPress={() => send.mutate(text)}
          />
        </View>
        <View style={s.split}>
          {!c.swapItem && c.item.status === 'LIVE' && (
            <Pressable onPress={() => setShowOffer((v) => !v)}>
              <T style={{ color: C.brand, fontSize: 13 }}>＋ Make an offer</T>
            </Pressable>
          )}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <T style={{ fontSize: 11, color: C.muted }}>{rating ? 'Rated ✓' : 'Rate'}</T>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                accessibilityLabel={`Rate ${n} stars`}
                key={n}
                disabled={rate.isPending}
                onPress={() => rate.mutate(n)}
              >
                <T style={{ fontSize: 20, color: n <= rating ? C.mango : C.muted }}>★</T>
              </Pressable>
            ))}
          </View>
        </View>
      </Page>
    </KeyboardAvoidingView>
  );
}
