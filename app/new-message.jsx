import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

const API_URL = 'https://hiking-trail-guide-api.vercel.app/api';

const COLORS = {
  main: '#694F2E',
  secondary: '#C9AD8A',
  dark: '#3E2D1D',
  cream: '#F8F4EE',
  white: '#FFFFFF',
  text: '#352B21',
  muted: '#8B7A68',
  border: '#E8DED1',
  light: '#EFE4D5',
  pale: '#F2E9DE',
};

export default function NewMessageScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const token = await SecureStore.getItemAsync('authToken');

      if (!token) {
        setError('Please sign in again to view users.');
        return;
      }

      const response = await fetch(`${API_URL}/chat/users`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Unable to load users.');
      }

      const userList = Array.isArray(data)
        ? data
        : data.users || data.data || [];

      setUsers(Array.isArray(userList) ? userList : []);
    } catch (err) {
      setError(
        err.message === 'Endpoint not found.'
          ? 'The users endpoint is not available on the deployed backend yet.'
          : err.message || 'Unable to connect to the server.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return users;

    return users.filter((user) => {
      const name =
        user.display_name ||
        user.username ||
        [user.fname, user.lname].filter(Boolean).join(' ') ||
        user.name ||
        '';

      return name.toLowerCase().includes(query);
    });
  }, [search, users]);

  const getUserName = (user) =>
    user.display_name ||
    user.username ||
    [user.fname, user.lname].filter(Boolean).join(' ') ||
    user.name ||
    'User';

  const startConversation = (user) => {
    const userId = user.id ?? user.user_id;

    if (userId == null) {
      Alert.alert('Unable to continue', 'This user has no valid ID.');
      return;
    }

    router.push({
      pathname: '/chat',
      params: {
        userId: String(userId),
        name: getUserName(user),
      },
    });
  };

  const renderUser = ({ item }) => (
    <TouchableOpacity
      style={styles.userCard}
      activeOpacity={0.75}
      onPress={() => startConversation(item)}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {getUserName(item).charAt(0).toUpperCase()}
        </Text>
      </View>

      <View style={styles.userInfo}>
        <Text style={styles.userName} numberOfLines={1}>
          {getUserName(item)}
        </Text>
        <Text style={styles.userSubtitle}>Start a conversation</Text>
      </View>

      <MaterialCommunityIcons
        name="chevron-right"
        size={25}
        color={COLORS.main}
      />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={24}
            color={COLORS.main}
          />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>STAY CONNECTED</Text>
          <Text style={styles.title}>New Message</Text>
          <Text style={styles.subtitle}>
            Find someone to chat with.
          </Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <MaterialCommunityIcons
          name="magnify"
          size={23}
          color={COLORS.muted}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search people..."
          placeholderTextColor={COLORS.muted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <MaterialCommunityIcons
              name="close-circle"
              size={20}
              color={COLORS.muted}
            />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>PEOPLE</Text>
        <Text style={styles.count}>{users.length} users</Text>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={COLORS.main} />
          <Text style={styles.stateText}>Finding people...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <View style={styles.stateIcon}>
            <MaterialCommunityIcons
              name="cloud-alert-outline"
              size={34}
              color={COLORS.main}
            />
          </View>
          <Text style={styles.stateTitle}>Couldn't load users</Text>
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={loadUsers}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="refresh"
              size={18}
              color={COLORS.white}
            />
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : filteredUsers.length === 0 ? (
        <View style={styles.centerState}>
          <View style={styles.stateIcon}>
            <MaterialCommunityIcons
              name="account-search-outline"
              size={36}
              color={COLORS.main}
            />
          </View>
          <Text style={styles.stateTitle}>
            {search ? 'No matching users' : 'No people found'}
          </Text>
          <Text style={styles.stateText}>
            {search
              ? 'Try searching with a different name.'
              : 'Registered users will appear here when available.'}
          </Text>
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch('')}
              style={styles.clearButton}
            >
              <Text style={styles.clearButtonText}>Clear Search</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item, index) =>
            String(item.id ?? item.user_id ?? index)
          }
          renderItem={renderUser}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshing={loading}
          onRefresh={loadUsers}
        />
      )}

      <Text style={styles.footer}>
        Connect with other hikers in Verdant.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.cream,
    paddingHorizontal: 22,
    paddingTop: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 25,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  headerText: {
    flex: 1,
    paddingTop: 2,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    color: COLORS.main,
    marginBottom: 5,
  },
  title: {
    fontSize: 27,
    fontWeight: '800',
    color: COLORS.dark,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 5,
  },
  searchContainer: {
    height: 53,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 27,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: COLORS.text,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 13,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
    color: COLORS.dark,
  },
  count: {
    fontSize: 12,
    color: COLORS.muted,
  },
  listContent: {
    paddingBottom: 20,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 14,
    marginBottom: 11,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.light,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.main,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  userSubtitle: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 4,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingBottom: 50,
  },
  stateIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: COLORS.light,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 17,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.dark,
    textAlign: 'center',
    marginBottom: 8,
  },
  stateText: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 9,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.main,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 13,
    marginTop: 20,
    gap: 8,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.white,
  },
  clearButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: COLORS.light,
    borderRadius: 12,
    marginTop: 18,
  },
  clearButtonText: {
    color: COLORS.main,
    fontSize: 13,
    fontWeight: '700',
  },
  footer: {
    textAlign: 'center',
    color: COLORS.muted,
    fontSize: 11,
    paddingVertical: 15,
  },
});