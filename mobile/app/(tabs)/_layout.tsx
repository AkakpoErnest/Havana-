import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C } from '../../src/ui';
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.brand,
        tabBarInactiveTintColor: C.muted,
        tabBarStyle: { backgroundColor: 'white', borderTopColor: C.line },
        tabBarLabelStyle: { fontFamily: 'BricolageGrotesque_700Bold', fontSize: 11 },
      }}
    >
      {(
        [
          ['index', 'Discover', 'sparkles-outline'],
          ['list', 'Sell / Swap', 'add-circle-outline'],
          ['inbox', 'Inbox', 'chatbubbles-outline'],
          ['profile', 'You', 'person-outline'],
        ] as const
      ).map(([name, title, icon]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, size }) => <Ionicons name={icon} color={color} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
