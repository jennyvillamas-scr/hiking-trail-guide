import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Index() {
  const [destination, setDestination] = useState(null);
  const [loadError, setLoadError] = useState(false);

  const checkSession = useCallback(async () => {
    setLoadError(false);

    try {
      const token = await SecureStore.getItemAsync('authToken');
      setDestination(token ? '/(tabs)/home' : '/login');
    } catch (error) {
      console.error('Unable to restore the saved session:', error);
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  if (destination) {
    return <Redirect href={destination} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        {loadError ? (
          <>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={38}
              color="#694F2E"
            />
            <Text style={styles.message}>
              We could not check your saved sign-in.
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={checkSession}
              accessibilityRole="button"
            >
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color="#C9AD8A" />
            <Text style={styles.message}>Restoring your session...</Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F0E6',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  message: {
    marginTop: 14,
    color: '#352719',
    fontSize: 15,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#694F2E',
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
