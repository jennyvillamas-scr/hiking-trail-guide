import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function TabLayout() {
  const router = useRouter();

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <Tabs
          screenOptions={{
            headerShown: true,
            headerTitleAlign: 'left',
            headerStyle: {
              backgroundColor: '#694F2E',
              height: 80,
            },
            headerTintColor: '#C9AD8A',
            headerTitleStyle: {
              fontSize: 22,
              fontWeight: 'bold',
            },
            tabBarActiveTintColor: '#DCC6A9',
            tabBarInactiveTintColor: '#8D785F',
            tabBarStyle: {
              height: 68,
              paddingBottom: 9,
              paddingTop: 7,
              backgroundColor: '#694F2E',
              borderTopWidth: 1,
              borderTopColor: '#8D6D48',
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
          accessibilityLabel="Open messages"
        >
          <MaterialCommunityIcons
            name="message-text"
            size={27}
            color="#F7F0E6"
          />
          <View style={styles.onlineDot} />
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
    backgroundColor: '#694F2E',
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
  onlineDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#8BA66A',
    borderWidth: 2,
    borderColor: '#694F2E',
  },
});