import React from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Item, Mode } from './types';
import { C, T, label, money } from './ui';
import { photoUrl } from './api';
export function SwipeCard({
  item,
  mode,
  disabled,
  onSwipe,
  onOpen,
}: {
  item: Item;
  mode: Mode;
  disabled: boolean;
  onSwipe: (d: 'LEFT' | 'RIGHT' | 'UP') => void;
  onOpen: () => void;
}) {
  const { width: screenWidth, height } = useWindowDimensions();
  const width = screenWidth - 40;
  const compact = height < 740;
  const x = useSharedValue(0),
    y = useSharedValue(0);
  const leaving = useSharedValue(false);
  const pan = Gesture.Pan()
    .enabled(!disabled)
    .minDistance(12)
    .onUpdate((e) => {
      x.value = e.translationX;
      y.value = e.translationY;
    })
    .onEnd(() => {
      if (leaving.value) return;
      if (y.value < -90 && Math.abs(y.value) > Math.abs(x.value) && mode === 'SHOP') {
        leaving.value = true;
        y.value = withTiming(-height * 1.2, { duration: 180 }, (finished) => {
          if (finished) runOnJS(onSwipe)('UP');
        });
      } else if (x.value > 90) {
        leaving.value = true;
        x.value = withTiming(width * 1.35, { duration: 180 }, (finished) => {
          if (finished) runOnJS(onSwipe)('RIGHT');
        });
      } else if (x.value < -90) {
        leaving.value = true;
        x.value = withTiming(-width * 1.35, { duration: 180 }, (finished) => {
          if (finished) runOnJS(onSwipe)('LEFT');
        });
      } else {
        x.value = withSpring(0);
        y.value = withSpring(0);
      }
    });
  const transform = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: `${interpolate(x.value, [-width, width], [-12, 12])}deg` },
    ],
  }));
  const right = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [20, 100], [0, 1], 'clamp'),
  }));
  const left = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-100, -20], [1, 0], 'clamp'),
  }));
  const up = useAnimatedStyle(() => ({
    opacity: mode === 'SHOP' ? interpolate(y.value, [-100, -20], [1, 0], 'clamp') : 0,
  }));
  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          {
            flex: 1,
            minHeight: compact ? 160 : 260,
            borderRadius: 28,
            backgroundColor: 'white',
            overflow: 'hidden',
            boxShadow: '0px 8px 22px rgba(35,32,107,0.10)',
          },
          transform,
        ]}
      >
        <Pressable accessibilityLabel={`View ${item.title}`} onPress={onOpen} style={{ flex: 1 }}>
          <Image
            source={photoUrl(item.photos[0])}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            style={{ flex: 1, backgroundColor: '#E6E4DF' }}
          />
          <View
            style={{
              position: 'absolute',
              right: 16,
              top: 23,
              backgroundColor: mode === 'SHOP' ? C.mango : C.pink,
              padding: 13,
              borderRadius: 5,
              transform: [{ rotate: '8deg' }],
            }}
          >
            <T style={{ fontSize: 11, color: mode === 'SHOP' ? C.ink : 'white' }}>
              {mode === 'SHOP' ? 'GOOD FIND' : 'SWAP VALUE'}
            </T>
            <T
              style={{
                fontFamily: 'BricolageGrotesque_700Bold',
                fontSize: 25,
                color: mode === 'SHOP' ? C.ink : 'white',
              }}
            >
              {money(mode === 'SHOP' ? item.price : item.swapValue)}
            </T>
          </View>
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: 95,
                left: 20,
                borderWidth: 4,
                borderColor: C.leaf,
                padding: 10,
                borderRadius: 8,
                backgroundColor: 'white',
                transform: [{ rotate: '-12deg' }],
              },
              right,
            ]}
          >
            <T style={{ fontSize: 28, color: C.leaf }}>{mode === 'SHOP' ? 'WANT IT' : 'SWAP?'}</T>
          </Animated.View>
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: 95,
                right: 20,
                borderWidth: 4,
                borderColor: C.pink,
                padding: 10,
                borderRadius: 8,
                backgroundColor: 'white',
              },
              left,
            ]}
          >
            <T style={{ fontSize: 28, color: C.pink }}>PASS</T>
          </Animated.View>
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: 160,
                left: 25,
                backgroundColor: C.mango,
                padding: 13,
                borderRadius: 8,
              },
              up,
            ]}
          >
            <T style={{ fontSize: 25 }}>MAKE OFFER</T>
          </Animated.View>
          <View style={{ padding: compact ? 12 : 18, gap: compact ? 4 : 7 }}>
            <T
              style={{ fontSize: compact ? 21 : 24, fontFamily: 'BricolageGrotesque_700Bold' }}
              numberOfLines={1}
            >
              {item.title}
            </T>
            <T style={{ color: C.muted, fontSize: 13 }}>
              {item.area} ·{' '}
              {item.distanceKm != null ? `${item.distanceKm.toFixed(1)} km away · ` : ''}
              {label(item.condition)}
            </T>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T style={{ fontSize: 12, color: C.brand }}>{item.owner.name}</T>
              {item.swap && <T style={{ fontSize: 12, color: C.pink }}>↔ Open to swaps</T>}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}
