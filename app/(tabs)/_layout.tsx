import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useRouter } from 'expo-router';
import { useDriverStore } from '../providers/DriverProvider';
import CustomTabBar from '../components/CustomTabBar';

export default function TabLayout() {
  const { driverProfile } = useDriverStore();
  const router = useRouter();

  React.useEffect(() => {
    if (driverProfile && !driverProfile.contract_accepted_at) {
      router.replace('/driver-contract' as any);
    }
  }, [driverProfile, router]);

  const renderTabBar = React.useCallback((props: any) => <CustomTabBar {...props} />, []);

  return (
    <Tabs
      tabBar={renderTabBar}
      screenOptions={{
        headerShown: false,
        animation: 'fade',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil', // Renommé de Dashboard à Accueil pour plus de clarté
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="wallet/index"
        options={{
          title: 'Portefeuille',
          tabBarIcon: ({ color, size }) => <Ionicons name="wallet" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="stats/index"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile/index"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="wallet/withdraw"
        options={{
          href: null, // Masquer l'écran de retrait de la barre d'onglets
        }}
      />
      <Tabs.Screen
        name="historique"
        options={{
          title: 'Historique',
          href: null, // Masquer l'onglet Historique pour l'instant
          tabBarIcon: ({ color, size }) => <Ionicons name="time" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
