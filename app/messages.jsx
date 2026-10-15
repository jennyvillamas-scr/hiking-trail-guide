import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StatusBar,
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
  background: '#694F2E',
  container: '#C9AD8A',
  cream: '#F7F0E6',
  white: '#FBF7F0',
  light: '#E8DCCB',
  border: '#B89A75',
  dark: '#352719',
  text: '#352719',
  muted: '#d1ae88',
};

function getUserName(user) {
  return (
    user?.displayName ||
    user?.username ||
    [user?.fname, user?.lname].filter(Boolean).join(' ') ||
    user?.name ||
    'Verdant user'
  );
}

function getUserPhoto(user) {
  const photo =
    user?.profilePhoto ||
    user?.profile_photo ||
    user?.photo ||
    user?.avatar ||
    user?.avatarUrl ||
    user?.avatar_url ||
    null;

  return typeof photo === 'string' && photo.trim()
    ? photo.trim()
    : null;
}

export default function MessagesScreen() {
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [failedPhotos, setFailedPhotos] = useState({});
  const loadingRef = useRef(false);
  const hasConversationsRef = useRef(false);

  const loadConversations = useCallback(async (isRefresh = false, silent = false) => {
    if (loadingRef.current) return;

    loadingRef.current = true;
    if (isRefresh) {
      setRefreshing(true);
    } else if (!silent) {
      setLoading(true);
    }
    setLoadError('');

    try {
      const token = await SecureStore.getItemAsync('authToken');

      if (!token) {
        setConversations([]);
        hasConversationsRef.current = false;
        setLoadError('Please log in again to view your messages.');
        return;
      }

      const response = await fetch(
        `${API_URL}/chat/conversations`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || 'Unable to load conversations.'
        );
      }

      const nextConversations = Array.isArray(data.conversations)
        ? data.conversations
        : [];
      hasConversationsRef.current = nextConversations.length > 0;
      setConversations(nextConversations);

      setFailedPhotos({});
    } catch (error) {
      const message =
        error.message || 'Unable to connect to the server.';

      if (silent && hasConversationsRef.current) {
        console.warn('Unable to refresh conversations:', message);
      } else {
        setLoadError(message);
      }
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
      loadingRef.current = false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadConversations();
      const interval = setInterval(() => {
        loadConversations(false, true);
      }, 5000);

      return () => clearInterval(interval);
    }, [loadConversations])
  );

  const filteredConversations = conversations.filter((item) => {
    const name = getUserName(item.otherUser);

    return name
      .toLowerCase()
      .includes(search.trim().toLowerCase());
  });

  const openConversation = (item) => {
    const otherUser = item.otherUser;

    if (!otherUser?.id) {
      Alert.alert(
        'Unable to open chat',
        'The other user could not be identified.'
      );
      return;
    }

    router.push({
      pathname: '/chat',
      params: {
        conversationId: String(item.id),
        userId: String(otherUser.id),
        username: getUserName(otherUser),
      },
    });
  };

  const renderConversation = ({ item }) => {
    const otherUser = item.otherUser;
    const name = getUserName(otherUser);
    const photo = getUserPhoto(otherUser);
    const photoKey = String(otherUser?.id ?? item.id);
    const showPhoto = photo && !failedPhotos[photoKey];

    return (
      <TouchableOpacity
        style={styles.conversation}
        activeOpacity={0.75}
        onPress={() => openConversation(item)}
      >
        <View style={styles.avatar}>
          {showPhoto ? (
            <Image
              source={{ uri: photo }}
              style={styles.avatarImage}
              resizeMode="cover"
              onError={() => {
                setFailedPhotos((previous) => ({
                  ...previous,
                  [photoKey]: true,
                }));
              }}
            />
          ) : (
            <Text style={styles.avatarText}>
              {name.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>

        <View style={styles.conversationDetails}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>

          <Text style={styles.lastMessage} numberOfLines={1}>
            {item.lastMessage || 'Start your conversation'}
          </Text>
        </View>

        {Number(item.unreadCount) > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>
              {Number(item.unreadCount) > 99
                ? '99+'
                : item.unreadCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={COLORS.cream}
      />

      <View style={styles.heading}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>

        <View style={styles.headingContent}>
          <Text style={styles.eyebrow}>STAY CONNECTED</Text>
          <Text style={styles.title}>Messages</Text>
          <Text style={styles.subtitle}>
            Connect with fellow outdoor explorers.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.addButton}
          activeOpacity={0.8}
          onPress={() => router.push('/new-message')}
          accessibilityRole="button"
          accessibilityLabel="Start a new conversation"
        >
          <MaterialCommunityIcons
            name="plus"
            size={24}
            color={COLORS.white}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>⌕</Text>

        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations"
          placeholderTextColor={COLORS.muted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          returnKeyType="search"
        />

        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={styles.clearSearch}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          YOUR CONVERSATIONS
        </Text>
        <Text style={styles.count}>
          {filteredConversations.length}
        </Text>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator
            size="large"
            color={COLORS.main}
          />
          <Text style={styles.stateText}>
            Loading conversations...
          </Text>
        </View>
      ) : loadError ? (
        <View style={styles.centerState}>
          <Text style={styles.stateEmoji}>⚠️</Text>
          <Text style={styles.emptyTitle}>
            Couldn&apos;t load messages
          </Text>
          <Text style={styles.emptyDescription}>
            {loadError}
          </Text>

          <TouchableOpacity
            style={styles.findButton}
            onPress={() => loadConversations()}
            activeOpacity={0.85}
          >
            <Text style={styles.findButtonText}>
              Try Again
            </Text>
          </TouchableOpacity>
        </View>
      ) : filteredConversations.length > 0 ? (
        <FlatList
          data={filteredConversations}
          renderItem={renderConversation}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadConversations(true)}
              tintColor={COLORS.main}
              colors={[COLORS.main]}
            />
          }
        />
      ) : (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyEmoji}>🌿</Text>
          </View>

          <Text style={styles.emptyTitle}>
            {search
              ? 'No matching conversations'
              : 'No conversations yet'}
          </Text>

          <Text style={styles.emptyDescription}>
            {search
              ? 'Try another name or clear your search.'
              : 'Your hiking connections will appear here. Start a conversation with another Verdant user to plan your next adventure.'}
          </Text>

          {search.length > 0 && (
            <TouchableOpacity
              style={styles.findButton}
              onPress={() => setSearch('')}
            >
              <Text style={styles.findButtonText}>
                Clear Search
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          VERDANT  •  EXPLORE TOGETHER
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
container: {
  flex: 1,
  backgroundColor: COLORS.main,
  paddingHorizontal: 20,
},
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 22,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  backButtonText: {
    color: COLORS.main,
    fontSize: 32,
    lineHeight: 35,
    marginTop: -3,
  },
  headingContent: {
    flex: 1,
  },
  addButton: {
    width: 44,
    height: 44,
    marginLeft: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: COLORS.main,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  eyebrow: {
    color: COLORS.main,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 7,
  },
  title: {
    color: COLORS.dark,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 6,
    lineHeight: 18,
  },
  headingIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.light,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  headingEmoji: {
    fontSize: 23,
  },
  searchContainer: {
    height: 50,
    borderRadius: 15,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 28,
  },
  searchIcon: {
    fontSize: 27,
    color: COLORS.main,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
  },
  clearSearch: {
    color: COLORS.muted,
    fontSize: 18,
    paddingLeft: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  count: {
    marginLeft: 9,
    color: COLORS.main,
    fontSize: 11,
    fontWeight: '800',
    backgroundColor: COLORS.light,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  list: {
    paddingBottom: 20,
    flexGrow: 1,
  },
  conversation: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 12,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.light,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
  },
  avatarText: {
    color: COLORS.main,
    fontSize: 19,
    fontWeight: '800',
  },
  conversationDetails: {
    flex: 1,
  },
  name: {
    color: COLORS.dark,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 5,
  },
  lastMessage: {
    color: COLORS.muted,
    fontSize: 12,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.main,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    marginLeft: 8,
  },
  unreadText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '800',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingBottom: 45,
  },
  stateText: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 12,
  },
  stateEmoji: {
    fontSize: 32,
    marginBottom: 14,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingBottom: 45,
  },
  emptyIcon: {
    width: 82,
    height: 82,
    borderRadius: 28,
    backgroundColor: COLORS.light,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  emptyEmoji: {
    fontSize: 36,
  },
  emptyTitle: {
    color: COLORS.dark,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyDescription: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 300,
    marginBottom: 24,
  },
  findButton: {
    backgroundColor: COLORS.main,
    minWidth: 165,
    minHeight: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  findButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
  },
  buttonArrow: {
    color: COLORS.white,
    fontSize: 19,
    marginLeft: 12,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  footerText: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
});