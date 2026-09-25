import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { C } from './ui';

/** A once-per-mount intro; app startup continues behind this overlay. */
export function LaunchIntro({ onFinish }: { onFinish: () => void }) {
  const [reveal] = useState(() => new Animated.Value(0));
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    let cancelled = false;
    let animation: Animated.CompositeAnimation | undefined;
    const finish = () => {
      if (!cancelled) onFinish();
    };
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      if (enabled) {
        animation?.stop();
        finish();
      }
    });
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (cancelled) return;
        if (reduceMotion) return finish();
        animation = Animated.sequence([
          Animated.timing(reveal, {
            toValue: 1,
            duration: 700,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.delay(550),
          Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]);
        animation.start(({ finished }) => {
          if (finished) finish();
        });
      })
      .catch(finish);
    return () => {
      cancelled = true;
      animation?.stop();
      subscription.remove();
    };
  }, [onFinish, opacity, reveal]);

  return (
    <Animated.View style={[styles.overlay, { opacity }]} accessibilityLabel="Welcome to Havana">
      <View style={styles.center}>
        <Animated.View
          accessible={false}
          style={[
            styles.accent,
            styles.mango,
            {
              transform: [
                { translateX: reveal.interpolate({ inputRange: [0, 1], outputRange: [-90, 0] }) },
                {
                  rotate: reveal.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['-35deg', '-12deg'],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          accessible={false}
          style={[
            styles.accent,
            styles.pink,
            {
              transform: [
                { translateX: reveal.interpolate({ inputRange: [0, 1], outputRange: [90, 0] }) },
                {
                  rotate: reveal.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['35deg', '14deg'],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={{
            opacity: reveal,
            transform: [
              { translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
            ],
          }}
        >
          <Text style={styles.wordmark} maxFontSizeMultiplier={1.2}>
            havana<Text style={styles.dot}>.</Text>
          </Text>
          <Text style={styles.tagline}>Good things. New neighbours.</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: C.brand,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  center: {
    width: '100%',
    maxWidth: 380,
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accent: { position: 'absolute', width: 64, height: 78, borderRadius: 20 },
  mango: { backgroundColor: C.mango, top: 6, left: '23%' },
  pink: { backgroundColor: C.pink, bottom: 0, right: '23%' },
  wordmark: {
    color: C.white,
    fontFamily: 'BricolageGrotesque_700Bold',
    fontSize: 68,
    letterSpacing: -4,
    textAlign: 'center',
  },
  dot: { color: C.mango },
  tagline: {
    color: C.white,
    fontFamily: 'BricolageGrotesque_500Medium',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
  },
});
