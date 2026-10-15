import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const API_URL = 'https://hiking-trail-guide-api.vercel.app/api';

export default function TabLayout() {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('authToken');

      if (!token) {
        setUnreadCount(0);
        return;
      }

      const response = await fetch(`${API_URL}/chat/conversations`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Unable to check unread messages.');
      }

      const totalUnread = Array.isArray(data.conversations)
        ? data.conversations.reduce(
            (total, conversation) =>
              total + Math.max(0, Number(conversation.unreadCount) || 0),
            0
          )
        : 0;

      setUnreadCount(totalUnread);
    } catch (error) {
      console.warn('Unable to refresh unread message count:', error.message);
    }
  }, []);

  useEffect(() => {
    loadUnreadCount();

    const interval = setInterval(loadUnreadCount, 5000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        loadUnreadCount();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [loadUnreadCount]);

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <Tabs
          screenOptions={{
            headerShown: true,
            headerTitleAlign: 'left',
            headerStyle: {
              backgroundColor: '#3B2818',
              height: 80,
            },
            headerTintColor: '#F7F0E6',
            headerTitleStyle: {
              fontSize: 22,
              fontWeight: 'bold',
            },
            tabBarActiveTintColor: '#F7F0E6',
            tabBarInactiveTintColor: '#C9AD8A',
            tabBarStyle: {
              height: 68,
              paddingBottom: 9,
              paddingTop: 7,
              backgroundColor: '#3B2818',
              borderTopWidth: 1,
              borderTopColor: '#59412D',
              elevation: 12,
            },
            tabBarLabelStyle: {
              fontSize: 10,
              fontWeight: '700',
            },
          }}
        >
          <Tabs.Screen
            name="home"
            options={{
              title: 'Home',
              headerTitle: 'PEAKLY • Peak Peaks',
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons
                  name="home"
                  size={size}
                  color={color}
                />
              ),
            }}
          />

          <Tabs.Screen
            name="livetopo"
            options={{
              title: 'LiveTopo',
              headerTitle: 'PEAKLY • Live Topography',
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons
                  name="terrain"
                  size={size}
                  color={color}
                />
              ),
            }}
          />

          <Tabs.Screen
            name="maps"
            options={{
              title: 'Maps',
              headerTitle: 'PEAKLY • Maps',
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons
                  name="map"
                  size={size}
                  color={color}
                />
              ),
            }}
          />

          <Tabs.Screen
            name="favorites"
            options={{
              title: 'Favorites',
              headerTitle: 'PEAKLY • Favorites',
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons
                  name="heart"
                  size={size}
                  color={color}
                />
              ),
            }}
          />

          <Tabs.Screen
            name="marketplace"
            options={{
              title: 'Market',
              headerTitle: 'PEAKLY • Marketplace',
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons
                  name="bag-personal"
                  size={size}
                  color={color}
                />
              ),
            }}
          />

          <Tabs.Screen
            name="profile"
            options={{
              title: 'Profile',
              headerTitle: 'PEAKLY • Profile',
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons
                  name="account"
                  size={size}
                  color={color}
                />
              ),
            }}
          />
        </Tabs>

        <TouchableOpacity
          style={styles.chatButton}
          activeOpacity={0.85}
          onPress={() => router.push('/messages')}
          accessibilityRole="button"
          accessibilityLabel={
            unreadCount > 0
              ? `Open messages, ${unreadCount} unread`
              : 'Open messages'
          }
        >
          <MaterialCommunityIcons
            name="message-text"
            size={27}
            color="#F7F0E6"
          />
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F0E6',
  },
  chatButton: {
    position: 'absolute',
    right: 18,
    bottom: 84,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B2818',
    borderWidth: 1,
    borderColor: '#C9AD8A',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#352719',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.22,
    shadowRadius: 5,
    zIndex: 100,
  },
  unreadBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 21,
    height: 21,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: '#D94F55',
    borderColor: '#3B2818',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
  },
});