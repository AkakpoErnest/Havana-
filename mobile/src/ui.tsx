import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Item } from './types';
import { thumbUrl } from './api';
export const C = {
  brand: '#23206B',
  mango: '#FFB020',
  pink: '#F0437B',
  leaf: '#1FA774',
  ink: '#16152E',
  muted: '#6B6A86',
  bg: '#F6F6FA',
  line: '#E5E4EE',
  white: '#FFFFFF',
};
export const categories = [
  'CLOTHES',
  'SHOES',
  'BAGS',
  'FURNITURE',
  'ELECTRONICS',
  'HOUSEHOLD',
  'OTHER',
] as const;
export const label = (s: string) =>
  s
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
export const money = (n: number | null | undefined) =>
  `GH₵${(n ?? 0).toLocaleString('en-GH', { maximumFractionDigits: 0 })}`;
export function T({ children, style, ...props }: React.ComponentProps<typeof Text>) {
  return (
    <Text
      {...props}
      style={[{ fontFamily: 'BricolageGrotesque_500Medium', color: C.ink, fontSize: 15 }, style]}
    >
      {children}
    </Text>
  );
}
export function Title({ children }: { children: React.ReactNode }) {
  return <T style={s.title}>{children}</T>;
}
export function Page({
  children,
  scroll = true,
  compact = false,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  compact?: boolean;
}) {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: C.bg }}>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}>
          {children}
        </ScrollView>
      ) : (
        <View style={[s.page, { flex: 1 }, compact && { gap: 8, padding: 16, paddingBottom: 12 }]}>
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}
export function Button({
  title,
  onPress,
  color = C.brand,
  disabled = false,
  outline = false,
}: {
  title: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  outline?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        {
          backgroundColor: outline ? 'transparent' : color,
          borderColor: color,
          borderWidth: outline ? 1 : 0,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <T
        style={{
          color: outline ? color : color === C.mango ? C.ink : 'white',
          fontFamily: 'BricolageGrotesque_700Bold',
          textAlign: 'center',
        }}
      >
        {title}
      </T>
    </Pressable>
  );
}
export function Field({ label: heading, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 7 }}>
      <T style={s.label}>{heading}</T>
      <TextInput
        placeholderTextColor={C.muted}
        {...props}
        style={[s.input, props.multiline && { height: 100, textAlignVertical: 'top' }, props.style]}
      />
    </View>
  );
}
export function Chips({
  values,
  value,
  onChange,
  disabled = false,
}: {
  values: readonly string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
    >
      {values.map((v) => (
        <Pressable
          accessibilityRole="button"
          key={v}
          disabled={disabled}
          accessibilityState={{ disabled, selected: value === v }}
          onPress={() => onChange(v)}
          style={[s.chip, value === v && { backgroundColor: C.brand, borderColor: C.brand }]}
        >
          <T style={{ color: value === v ? 'white' : C.muted, fontSize: 13 }}>{label(v)}</T>
        </Pressable>
      ))}
    </ScrollView>
  );
}
export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  if (!error) return null;
  return (
    <View style={[s.box, { backgroundColor: '#FFE8EF' }]}>
      <T style={{ color: '#A82250' }}>{error instanceof Error ? error.message : String(error)}</T>
      {retry && <Button title="Try again" onPress={retry} outline />}
    </View>
  );
}
export function ConnectionWait() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, []);
  return slow ? (
    <T
      accessibilityLiveRegion="polite"
      style={{ color: C.muted, textAlign: 'center', padding: 16 }}
    >
      Connecting to Havana… this can take about a minute. Thanks for waiting.
    </T>
  ) : null;
}
export function Loading() {
  return (
    <View>
      <ActivityIndicator style={{ padding: 30 }} color={C.brand} />
      <ConnectionWait />
    </View>
  );
}
export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <View style={[s.box, { paddingVertical: 32 }]}>
      <T style={{ fontSize: 23, fontFamily: 'BricolageGrotesque_700Bold' }}>{title}</T>
      <T style={{ color: C.muted, lineHeight: 23 }}>{body}</T>
    </View>
  );
}
export function Safety() {
  return (
    <View style={[s.box, { backgroundColor: '#E7F5EE' }]}>
      <T style={{ color: '#14734F', fontSize: 13, lineHeight: 19 }}>
        Good deals. Safe meetups. Meet in public and check the item before paying. MoMo or cash on
        pickup, directly to the seller. No payments in Havana.
      </T>
    </View>
  );
}
export function ItemRow({ item, onLongPress }: { item: Item; onLongPress?: () => void }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
      onLongPress={onLongPress}
      style={s.row}
    >
      <Image
        source={thumbUrl(item.photos[0])}
        style={{ width: 76, height: 76, borderRadius: 15 }}
        contentFit="cover"
      />
      <View style={{ flex: 1, gap: 5 }}>
        <T style={{ fontFamily: 'BricolageGrotesque_700Bold' }}>{item.title}</T>
        <T style={{ color: C.muted, fontSize: 12 }}>
          {item.area} · {label(item.status)}
          {item.hidden ? ' · Hidden after reports' : ''}
        </T>
        <T style={{ color: C.brand }}>
          {item.sell ? money(item.price) : `Swap · ${money(item.swapValue)}`}
        </T>
      </View>
    </Pressable>
  );
}
export const s = StyleSheet.create({
  page: { padding: 20, gap: 16, paddingBottom: 32 },
  title: { fontFamily: 'BricolageGrotesque_700Bold', fontSize: 32, letterSpacing: -1 },
  label: { fontSize: 13, color: C.muted },
  input: {
    backgroundColor: 'white',
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 16,
    padding: 15,
    fontSize: 16,
    color: C.ink,
    fontFamily: 'BricolageGrotesque_500Medium',
  },
  button: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 19,
    minHeight: 50,
    justifyContent: 'center',
  },
  chip: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 30,
    paddingHorizontal: 17,
    paddingVertical: 10,
    backgroundColor: 'white',
  },
  box: { backgroundColor: 'white', padding: 18, borderRadius: 20, gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    backgroundColor: 'white',
    borderRadius: 20,
  },
  split: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  } satisfies ViewStyle,
});
