import React, { useState } from 'react';
import { Modal, View } from 'react-native';
import { Image } from 'expo-image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, thumbUrl } from '../src/api';
import { Item } from '../src/types';
import { Button, C, Empty, ErrorBox, Loading, Page, T, Title, label, money, s } from '../src/ui';

type Reported = Item & {
  owner: { id: string; name: string };
  reportCount: number;
  reports: { reason: string; createdAt: string }[];
};

/** Moderators only (server-enforced: admin email + a login code sent by email/SMS). */
export default function Moderation() {
  const cache = useQueryClient();
  const [removing, setRemoving] = useState<Reported | null>(null);
  const queue = useQuery({
    queryKey: ['admin-reports'],
    queryFn: () => api<Reported[]>('/admin/reports'),
  });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'restore' | 'remove' }) =>
      api(`/admin/items/${id}/${action}`, 'POST'),
    onSuccess: () => {
      setRemoving(null);
      void cache.invalidateQueries({ queryKey: ['admin-reports'] });
      void cache.invalidateQueries({ queryKey: ['feed'] });
    },
  });
  return (
    <Page>
      <Title>Review reports</Title>
      <T style={{ color: C.muted }}>
        Items are hidden automatically after 3 reports. Restore false alarms; remove real problems.
      </T>
      {queue.isPending && <Loading />}
      <ErrorBox error={queue.error ?? act.error} retry={() => void queue.refetch()} />
      {queue.data?.length === 0 && (
        <Empty title="All clear." body="No reported items right now. Nice work, neighbours." />
      )}
      {queue.data?.map((item) => (
        <View key={item.id} style={[s.box, { gap: 10 }]}>
          <View style={s.row}>
            <Image
              source={thumbUrl(item.photos[0])}
              style={{ width: 70, height: 70, borderRadius: 14, backgroundColor: C.line }}
              contentFit="cover"
            />
            <View style={{ flex: 1, gap: 4 }}>
              <T style={{ fontFamily: 'BricolageGrotesque_700Bold' }}>{item.title}</T>
              <T style={{ color: C.muted, fontSize: 12 }}>
                {item.owner.name} · {item.area} · {label(item.status)}
                {item.sell ? ` · ${money(item.price)}` : ''}
              </T>
              <T style={{ color: item.hidden ? C.pink : C.mango, fontSize: 12 }}>
                {item.reportCount} report{item.reportCount === 1 ? '' : 's'}
                {item.hidden ? ' · hidden from everyone' : ' · still visible'}
              </T>
            </View>
          </View>
          {item.reports.slice(0, 3).map((r, i) => (
            <T key={i} style={{ fontSize: 13, color: C.ink }}>
              “{r.reason}”
            </T>
          ))}
          {item.reports.length > 3 && (
            <T style={{ fontSize: 12, color: C.muted }}>+{item.reports.length - 3} more</T>
          )}
          <View style={s.split}>
            <View style={{ flex: 1 }}>
              <Button
                title="Restore"
                color={C.leaf}
                outline
                disabled={act.isPending || item.status === 'REMOVED'}
                onPress={() => act.mutate({ id: item.id, action: 'restore' })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title={item.status === 'REMOVED' ? 'Removed' : 'Remove'}
                color={C.pink}
                disabled={act.isPending || item.status === 'REMOVED'}
                onPress={() => setRemoving(item)}
              />
            </View>
          </View>
        </View>
      ))}
      <Modal
        visible={!!removing}
        transparent
        animationType="fade"
        onRequestClose={() => !act.isPending && setRemoving(null)}
      >
        <View
          style={{ flex: 1, backgroundColor: '#16152E88', justifyContent: 'center', padding: 20 }}
        >
          <View style={s.box}>
            <Title>Remove this listing?</Title>
            <T>
              “{removing?.title}” will be taken down for everyone. The seller keeps their account.
            </T>
            <Button
              title={act.isPending ? 'Removing…' : 'Remove listing'}
              color={C.pink}
              disabled={act.isPending}
              onPress={() => removing && act.mutate({ id: removing.id, action: 'remove' })}
            />
            <Button
              title="Cancel"
              outline
              disabled={act.isPending}
              onPress={() => setRemoving(null)}
            />
          </View>
        </View>
      </Modal>
    </Page>
  );
}
