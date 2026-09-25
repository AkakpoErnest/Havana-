import React, { useState } from 'react';
import { Alert, Platform, Pressable, Switch, View } from 'react-native';
import { Image } from 'expo-image';
import * as Picker from 'expo-image-picker';
import * as Manipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from '../../src/api';
import { photoForm } from '../../src/upload-form';
import { Button, C, Chips, ErrorBox, Field, Page, T, Title, categories, s } from '../../src/ui';
export default function ListItem() {
  const [photos, setPhotos] = useState<string[]>([]),
    [title, setTitle] = useState(''),
    [description, setDescription] = useState(''),
    [area, setArea] = useState(''),
    [category, setCategory] = useState('CLOTHES'),
    [condition, setCondition] = useState('GOOD'),
    [sell, setSell] = useState(true),
    [swap, setSwap] = useState(true),
    [price, setPrice] = useState(''),
    [swapValue, setSwapValue] = useState(''),
    [location, setLocation] = useState<{ latitude: number; longitude: number }>(),
    [error, setError] = useState<Error | null>(null),
    [picking, setPicking] = useState(false),
    [locating, setLocating] = useState(false);
  const cache = useQueryClient();
  async function choose(camera: boolean) {
    setPicking(true);
    setError(null);
    try {
      if (camera && !(await Picker.requestCameraPermissionsAsync()).granted)
        throw new Error('Allow camera access in Settings, or choose photos from your gallery.');
      const result = camera
        ? await Picker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await Picker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            selectionLimit: 6 - photos.length,
            quality: 0.8,
          });
      if (result.canceled) return;
      const compressed = await Promise.all(
        result.assets
          .slice(0, 6 - photos.length)
          .map(
            async (a) =>
              (
                await Manipulator.manipulateAsync(
                  a.uri,
                  [{ resize: a.width > a.height ? { width: 1200 } : { height: 1200 } }],
                  { compress: 0.75, format: Manipulator.SaveFormat.JPEG },
                )
              ).uri,
          ),
      );
      setPhotos((p) => [...p, ...compressed].slice(0, 6));
    } catch (e) {
      setError(e as Error);
    } finally {
      setPicking(false);
    }
  }
  async function locate() {
    setLocating(true);
    setError(null);
    try {
      if (!(await Location.requestForegroundPermissionsAsync()).granted)
        throw new Error('No problem — your area is enough. Location permission was not granted.');
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation(p.coords);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLocating(false);
    }
  }
  const publish = useMutation({
    mutationFn: async () => {
      if (
        !photos.length ||
        title.trim().length < 3 ||
        description.trim().length < 5 ||
        area.trim().length < 2
      )
        throw new Error('Add a photo, title, description and area.');
      if (!sell && !swap) throw new Error('Turn on selling or swapping.');
      if ((sell && !/^[1-9]\d*$/.test(price)) || (swap && !/^[1-9]\d*$/.test(swapValue)))
        throw new Error('Use positive, whole-cedi amounts.');
      const form = await photoForm(photos, Platform.OS);
      const upload = await api<{ photos: string[] }>('/uploads', 'POST', form);
      return api('/items', 'POST', {
        title: title.trim(),
        description: description.trim(),
        category,
        condition,
        sell,
        swap,
        ...(sell ? { price: Number(price) } : {}),
        ...(swap ? { swapValue: Number(swapValue) } : {}),
        photos: upload.photos,
        area: area.trim(),
        ...(location ? { latitude: location.latitude, longitude: location.longitude } : {}),
      });
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['me'] });
      void cache.invalidateQueries({ queryKey: ['feed'] });
      setPhotos([]);
      setTitle('');
      setDescription('');
      setPrice('');
      setSwapValue('');
      Alert.alert('You’re on the market!', 'Your item is live.');
      router.push('/(tabs)/profile');
    },
  });
  return (
    <Page>
      <T style={{ color: C.pink, fontSize: 12, letterSpacing: 2 }}>MAKE ROOM FOR SOMETHING NEW</T>
      <Title>Someone’s next{'\n'}favourite thing.</Title>
      <T style={{ color: C.muted }}>List it. Sell it. Or see what comes your way.</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {photos.map((uri, i) => (
          <Pressable
            accessibilityLabel="Remove photo"
            disabled={publish.isPending}
            onPress={() => setPhotos((p) => p.filter((_, j) => i !== j))}
            key={uri}
          >
            <Image source={uri} style={{ width: 95, height: 110, borderRadius: 16 }} />
            <T
              style={{
                position: 'absolute',
                top: 4,
                right: 7,
                backgroundColor: 'white',
                borderRadius: 12,
                paddingHorizontal: 5,
              }}
            >
              ×
            </T>
          </Pressable>
        ))}
      </View>
      <T style={s.label}>{photos.length}/6 photos · Tap a photo to remove it</T>
      <View style={s.split}>
        <Button
          title="＋ Gallery"
          outline
          disabled={photos.length >= 6 || picking || publish.isPending}
          onPress={() => void choose(false)}
        />
        <Button
          title="◎ Camera"
          outline
          disabled={photos.length >= 6 || picking || publish.isPending}
          onPress={() => void choose(true)}
        />
      </View>
      <Field
        label="Give it a name"
        placeholder="Vintage denim jacket"
        value={title}
        onChangeText={setTitle}
        editable={!publish.isPending}
        maxLength={100}
      />
      <T style={s.label}>Category</T>
      <Chips
        values={categories}
        value={category}
        onChange={setCategory}
        disabled={publish.isPending}
      />
      <T style={s.label}>Condition</T>
      <Chips
        values={['NEW', 'LIKE_NEW', 'GOOD', 'FAIR']}
        value={condition}
        onChange={setCondition}
        disabled={publish.isPending}
      />
      <View style={s.box}>
        <View style={s.split}>
          <T>For sale</T>
          <Switch
            disabled={publish.isPending}
            value={sell}
            onValueChange={setSell}
            trackColor={{ true: C.mango }}
          />
        </View>
        {sell && (
          <Field
            label="Asking price · GH₵"
            value={price}
            onChangeText={setPrice}
            editable={!publish.isPending}
            keyboardType="number-pad"
            placeholder="150"
          />
        )}
        <View style={s.split}>
          <T>Open to swaps</T>
          <Switch
            disabled={publish.isPending}
            value={swap}
            onValueChange={setSwap}
            trackColor={{ true: C.pink }}
          />
        </View>
        {swap && (
          <Field
            label="Estimated swap value · GH₵"
            value={swapValue}
            onChangeText={setSwapValue}
            editable={!publish.isPending}
            keyboardType="number-pad"
            placeholder="150"
          />
        )}
      </View>
      <Field
        label="The details (be honest about wear)"
        multiline
        value={description}
        onChangeText={setDescription}
        editable={!publish.isPending}
        maxLength={2000}
      />
      <Field
        label="Area in Accra"
        placeholder="Osu, Madina, East Legon…"
        value={area}
        onChangeText={setArea}
        editable={!publish.isPending}
      />
      <Button
        title={
          locating
            ? 'Finding your location…'
            : location
              ? '✓ Location attached'
              : '⌖ Add location (optional)'
        }
        disabled={locating || publish.isPending}
        outline
        onPress={() => void locate()}
      />
      <ErrorBox error={error ?? publish.error} />
      <Button
        title={publish.isPending ? 'Uploading & publishing…' : 'Put it on the market →'}
        color={C.mango}
        disabled={publish.isPending || picking || locating}
        onPress={() => {
          setError(null);
          publish.mutate();
        }}
      />
    </Page>
  );
}
