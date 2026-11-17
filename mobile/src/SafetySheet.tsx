import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { Button, C, ErrorBox, Field, T, Title, s } from './ui';

const REASONS = [
  'Scam or asking for payment first',
  'Rude, threatening or harassing',
  'Fake or prohibited item',
  'Something else',
] as const;

/** Report or block the other person in a chat (App Store guideline 1.2). */
export function SafetySheet({
  person,
  conversationId,
  blockedByMe,
  onClose,
}: {
  person: { id: string; name: string };
  conversationId?: string;
  blockedByMe: boolean;
  onClose: () => void;
}) {
  const cache = useQueryClient();
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const refresh = () => {
    for (const key of ['chat', 'inbox', 'feed', 'browse', 'item', 'saved', 'blocks'])
      void cache.invalidateQueries({ queryKey: [key] });
  };
  const report = useMutation({
    mutationFn: () =>
      api(`/users/${person.id}/report`, 'POST', {
        reason: [reason, details.trim()].filter(Boolean).join(': '),
        conversationId,
      }),
    onSuccess: () =>
      setDone(`Thanks. A Havana moderator will look at your report about ${person.name}.`),
  });
  const block = useMutation({
    mutationFn: () => api(`/blocks/${person.id}`, blockedByMe ? 'DELETE' : 'POST'),
    onSuccess: () => {
      refresh();
      setDone(
        blockedByMe
          ? `${person.name} is unblocked.`
          : `${person.name} is blocked. You won't see each other's listings, and neither of you can send messages or offers.`,
      );
    },
  });
  const busy = report.isPending || block.isPending;
  return (
    <Modal transparent animationType="fade" onRequestClose={() => !busy && onClose()}>
      <View
        style={{ flex: 1, backgroundColor: '#16152E88', justifyContent: 'center', padding: 20 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.box}>
            {done ? (
              <>
                <T style={{ lineHeight: 22 }}>{done}</T>
                <Button title="Done" onPress={onClose} />
              </>
            ) : (
              <>
                <Title>{person.name}</Title>
                <T style={{ color: C.muted }}>Report a problem</T>
                {REASONS.map((r) => (
                  <Pressable
                    key={r}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: reason === r }}
                    onPress={() => setReason(r)}
                    style={[
                      s.chip,
                      reason === r && { backgroundColor: C.brand, borderColor: C.brand },
                    ]}
                  >
                    <T style={{ color: reason === r ? 'white' : C.ink }}>{r}</T>
                  </Pressable>
                ))}
                <Field
                  label="Anything else we should know? (optional)"
                  value={details}
                  onChangeText={setDetails}
                  maxLength={400}
                  multiline
                />
                <Button
                  title={report.isPending ? 'Sending…' : 'Send report'}
                  color={C.pink}
                  disabled={!reason || busy}
                  onPress={() => report.mutate()}
                />
                <ErrorBox error={report.error ?? block.error} />
                <View style={{ height: 1, backgroundColor: C.line, marginVertical: 4 }} />
                <T style={{ color: C.muted, lineHeight: 20 }}>
                  {blockedByMe
                    ? `Unblocking lets you and ${person.name} see each other's listings and chat again.`
                    : `Blocking stops all messages, offers and swaps between you, and hides each other's listings. ${person.name} isn't told.`}
                </T>
                <Button
                  title={blockedByMe ? `Unblock ${person.name}` : `Block ${person.name}`}
                  outline
                  disabled={busy}
                  onPress={() => block.mutate()}
                />
                <Button title="Close" outline disabled={busy} onPress={onClose} />
              </>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
