import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';

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
  muted: '#6E573F',
};

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const listRef = useRef(null);
  const messagesRequestRef = useRef(false);
  const shouldScrollToLatestRef = useRef(true);

  const userId = String(params.userId || '');
  const conversationParam = Array.isArray(params.conversationId)
    ? params.conversationId[0]
    : params.conversationId;
  const routedConversationId = Number(conversationParam);
  const initialName = String(params.name || 'Conversation');
  const initialPhoto = String(
    params.profilePhoto || params.photo || ''
  );
  const initialUsername = String(params.username || '');

  const [conversationId, setConversationId] = useState(
    Number.isSafeInteger(routedConversationId) && routedConversationId > 0
      ? routedConversationId
      : null
  );
  const conversationIdRef = useRef(conversationId);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [profileName, setProfileName] = useState(initialName);
  const [profileUsername, setProfileUsername] = useState(initialUsername);
  const [profilePhoto, setProfilePhoto] = useState(initialPhoto);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  const request = async (path, options = {}) => {
    const token = await SecureStore.getItemAsync('authToken');

    if (!token) {
      throw new Error('Please sign in again.');
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(options.body
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok || data.success === false) {
      throw new Error(data.message || 'Request failed.');
    }

    return data;
  };

  const loadRecipientProfile = useCallback(async () => {
    if (!userId || !Number.isInteger(Number(userId))) return;

    try {
      const data = await request('/chat/users');
      const users = Array.isArray(data.users) ? data.users : [];

      const recipient = users.find(
        (user) => String(user.id ?? user.userId) === userId
      );

      if (recipient) {
        const nextName =
          recipient.displayName ||
          recipient.display_name ||
          recipient.username ||
          recipient.name;

        const nextUsername =
          recipient.username ||
          recipient.userName ||
          '';

        const nextPhoto =
          recipient.profilePhoto ||
          recipient.profile_photo ||
          recipient.avatarUrl ||
          recipient.avatar_url ||
          recipient.photo ||
          recipient.avatar ||
          '';

        if (nextName) setProfileName(nextName);
        if (nextUsername) setProfileUsername(nextUsername);

        if (nextPhoto !== profilePhoto) {
          setProfilePhoto(nextPhoto);
          setPhotoFailed(false);
        }
      }
    } catch (err) {
      console.log(
        'Unable to load recipient profile:',
        err.message
      );
    }
  }, [userId, profilePhoto]);

  const loadMessages = useCallback(async (silent = false) => {
    if (messagesRequestRef.current) return;

    if (!userId || !Number.isInteger(Number(userId))) {
      setError('Invalid recipient. Please select a user again.');
      setLoading(false);
      return;
    }

    messagesRequestRef.current = true;
    if (!silent) setLoading(true);

    try {
      let activeConversationId = conversationIdRef.current;

      if (!activeConversationId) {
        const conversationData = await request(
          '/chat/conversations',
          {
            method: 'POST',
            body: JSON.stringify({
              userId: Number(userId),
            }),
          }
        );

        activeConversationId =
          conversationData.conversation?.id;

        if (!activeConversationId) {
          throw new Error(
            'The server did not return a conversation ID.'
          );
        }

        conversationIdRef.current = activeConversationId;
        setConversationId(activeConversationId);

        const recipient =
          conversationData.conversation?.otherUser ||
          conversationData.conversation?.other_user;

        if (recipient) {
          const nextName =
            recipient.displayName ||
            recipient.display_name ||
            recipient.username;

          const nextPhoto =
            recipient.profilePhoto ||
            recipient.profile_photo ||
            '';

          if (nextName) setProfileName(nextName);

          if (recipient.username) {
            setProfileUsername(recipient.username);
          }

          if (nextPhoto) {
            setProfilePhoto(nextPhoto);
            setPhotoFailed(false);
          }
        }
      }

      const data = await request(
        `/chat/conversations/${activeConversationId}/messages`
      );

      if (data.currentUserId != null) {
        setCurrentUserId(data.currentUserId);
      }

      const fetchedMessages = Array.isArray(data.messages)
        ? data.messages.map((item) => ({
            ...item,
            isMine:
              item.isMine ??
              (data.currentUserId != null &&
                String(item.senderId ?? item.sender_id) ===
                  String(data.currentUserId)),
          }))
        : [];

      setMessages(fetchedMessages);
      setError('');
    } catch (err) {
      setError(err.message || 'Unable to load messages.');
    } finally {
      if (!silent) setLoading(false);
      messagesRequestRef.current = false;
    }
  }, [userId]);

  useEffect(() => {
    loadRecipientProfile();
  }, [loadRecipientProfile]);

  useFocusEffect(
    useCallback(() => {
      loadMessages();
      const interval = setInterval(() => {
        loadMessages(true);
      }, 4000);

      return () => clearInterval(interval);
    }, [loadMessages])
  );

  const latestFirstMessages = useMemo(
    () => [...messages].reverse(),
    [messages]
  );

  useEffect(() => {
    if (!shouldScrollToLatestRef.current) return undefined;

    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        offset: 0,
        animated: true,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [messages]);

  const sendMessage = async () => {
    const body = messageText.trim();

    if (!body || sending) return;

    setSending(true);
    shouldScrollToLatestRef.current = true;

    try {
      let activeConversationId = conversationIdRef.current;

      if (!activeConversationId) {
        const conversationData = await request(
          '/chat/conversations',
          {
            method: 'POST',
            body: JSON.stringify({
              userId: Number(userId),
            }),
          }
        );

        activeConversationId =
          conversationData.conversation?.id;

        if (!activeConversationId) {
          throw new Error('Could not open this conversation.');
        }

        conversationIdRef.current = activeConversationId;
        setConversationId(activeConversationId);
      }

      const data = await request(
        `/chat/conversations/${activeConversationId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ body }),
        }
      );

      if (data.message) {
        const sentMessage = {
          ...data.message,
          isMine: true,
          currentUserId:
            currentUserId ?? data.message.senderId,
        };

        setMessages((previous) => [
          ...previous,
          sentMessage,
        ]);
      } else {
        await loadMessages();
      }

      setMessageText('');
    } catch (err) {
      Alert.alert(
        'Message not sent',
        err.message || 'Please try again.'
      );
    } finally {
      setSending(false);
    }
  };

  const formatMessageTime = (createdAt) => {
    if (!createdAt) return '';

    const value = String(createdAt);
    const normalized =
      value.includes('Z') ||
      /[+-]\d{2}:\d{2}$/.test(value)
        ? value
        : `${value.replace(' ', 'T')}Z`;

    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) return '';

    return date.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const renderMessage = ({ item }) => {
    const senderId = item.senderId ?? item.sender_id;

    const isMine =
      item.isMine ??
      (currentUserId != null &&
        senderId != null &&
        String(senderId) === String(currentUserId));

    const senderName = isMine
      ? 'You'
      : item.senderDisplayName ||
        item.sender_display_name ||
        item.senderUsername ||
        item.sender_username ||
        profileName;

    const createdAt = item.createdAt || item.created_at;
    const readAt = item.readAt || item.read_at;
    const isSaved = item.id != null;

    return (
      <View
        style={[
          styles.messageRow,
          isMine
            ? styles.myMessageRow
            : styles.theirMessageRow,
        ]}
      >
        <View
          style={[
            styles.messageContent,
            isMine
              ? styles.myMessageContent
              : styles.theirMessageContent,
          ]}
        >
          <View
            style={[
              styles.messageBubble,
              isMine && styles.myMessageBubble,
            ]}
          >
            <Text
              style={[
                styles.senderLabel,
                isMine && styles.mySenderLabel,
              ]}
            >
              {senderName}
            </Text>

            <Text
              style={[
                styles.messageBody,
                isMine && styles.myMessageBody,
              ]}
            >
              {item.body || ''}
            </Text>

            <Text
              style={[
                styles.messageTime,
                isMine && styles.myMessageTime,
              ]}
            >
              {formatMessageTime(createdAt)}
            </Text>
          </View>

          {isMine && isSaved && (
            <View style={styles.messageStatus}>
              <MaterialCommunityIcons
                name={readAt ? 'check-all' : 'check'}
                size={13}
                color={readAt ? '#477653' : COLORS.muted}
              />
              <Text
                style={[
                  styles.messageStatusText,
                  readAt && styles.messageReadStatusText,
                ]}
              >
                {readAt ? 'Seen' : 'Sent'}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top']}>
        <KeyboardAvoidingView
          style={styles.keyboardContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={24}
            color={COLORS.main}
          />
        </TouchableOpacity>

        <View style={styles.avatar}>
          {profilePhoto && !photoFailed ? (
            <Image
              source={{ uri: profilePhoto }}
              style={styles.avatarImage}
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <Text style={styles.avatarText}>
              {profileName.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>

        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>
            {profileName}
          </Text>

          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {profileUsername
              ? `@${profileUsername.replace(/^@/, '')}`
              : 'Verdant member'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => {
            loadRecipientProfile();
            loadMessages();
          }}
        >
          <MaterialCommunityIcons
            name="refresh"
            size={22}
            color={COLORS.main}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.notice}>
        <MaterialCommunityIcons
          name="shield-check-outline"
          size={17}
          color={COLORS.main}
        />
        <Text style={styles.noticeText}>
          Your conversation stays inside Verdant.
        </Text>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator
            size="large"
            color={COLORS.main}
          />
          <Text style={styles.stateText}>
            Loading messages...
          </Text>
        </View>
      ) : error && messages.length === 0 ? (
        <View style={styles.centerState}>
          <MaterialCommunityIcons
            name="message-alert-outline"
            size={42}
            color={COLORS.main}
          />
          <Text style={styles.stateTitle}>
            Couldn&apos;t load messages
          </Text>
          <Text style={styles.stateText}>{error}</Text>

          <TouchableOpacity
            style={styles.retryButton}
            onPress={loadMessages}
          >
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {!!error && (
            <View style={styles.syncWarning}>
              <Text style={styles.syncWarningText}>
                New messages could not be checked. {error}
              </Text>
              <TouchableOpacity onPress={() => loadMessages(true)}>
                <Text style={styles.syncWarningAction}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
          <FlatList
            ref={listRef}
            data={latestFirstMessages}
            inverted
            keyExtractor={(item, index) => String(item.id ?? index)}
            renderItem={renderMessage}
            contentContainerStyle={[
              styles.messagesList,
              messages.length === 0 && styles.emptyList,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onScroll={(event) => {
              shouldScrollToLatestRef.current =
                event.nativeEvent.contentOffset.y <= 60;
            }}
            scrollEventThrottle={16}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <MaterialCommunityIcons
                    name="message-text-outline"
                    size={34}
                    color={COLORS.main}
                  />
                </View>

                <Text style={styles.emptyTitle}>
                  Start a conversation
                </Text>

                <Text style={styles.stateText}>
                  Send your first message to {profileName}.
                </Text>
              </View>
            }
          />
        </>
      )}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Write a message..."
          placeholderTextColor={COLORS.muted}
          value={messageText}
          onChangeText={setMessageText}
          multiline
          maxLength={2000}
          editable={!sending}
        />

        <TouchableOpacity
          style={[
            styles.sendButton,
            (!messageText.trim() || sending) &&
              styles.sendButtonDisabled,
          ]}
          onPress={sendMessage}
          disabled={!messageText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <MaterialCommunityIcons
              name="send"
              size={21}
              color={COLORS.white}
            />
          )}
        </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
container: {
  flex: 1,
  backgroundColor: COLORS.main,
},
keyboardContainer: {
  flex: 1,
  backgroundColor: COLORS.main,
},

header: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 17,
  paddingVertical: 13,
  backgroundColor: COLORS.secondary,
  borderBottomWidth: 1,
  borderBottomColor: COLORS.border,
},

notice: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: COLORS.light,
  paddingVertical: 10,
  gap: 7,
},

syncWarning: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: '#FDE8E7',
  paddingHorizontal: 14,
  paddingVertical: 8,
  gap: 10,
},
syncWarningText: {
  flex: 1,
  color: '#8F3028',
  fontSize: 12,
},
syncWarningAction: {
  color: COLORS.main,
  fontSize: 12,
  fontWeight: '800',
},

composer: {
  flexDirection: 'row',
  alignItems: 'flex-end',
  paddingHorizontal: 13,
  paddingVertical: 11,
  backgroundColor: COLORS.secondary,
  borderTopWidth: 1,
  borderTopColor: COLORS.border,
  gap: 10,
},

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.cream,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatar: {
    width: 43,
    height: 43,
    borderRadius: 15,
    backgroundColor: COLORS.light,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    color: COLORS.main,
    fontSize: 19,
    fontWeight: '800',
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.dark,
  },
  headerSubtitle: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 3,
  },
  refreshButton: {
    width: 39,
    height: 39,
    borderRadius: 13,
    backgroundColor: COLORS.cream,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  noticeText: {
    color: COLORS.dark,
    fontSize: 11,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 20,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  messageRow: {
    width: '100%',
    marginBottom: 13,
    flexDirection: 'row',
  },
  myMessageRow: {
    justifyContent: 'flex-end',
  },
  theirMessageRow: {
    justifyContent: 'flex-start',
  },
  messageContent: {
    maxWidth: '82%',
    alignItems: 'flex-start',
  },
  myMessageContent: {
    alignItems: 'flex-end',
  },
  theirMessageContent: {
    alignItems: 'flex-start',
  },

  messageBubble: {
  maxWidth: '100%',
  paddingHorizontal: 14,
  paddingTop: 11,
  paddingBottom: 8,
  borderRadius: 18,
  borderBottomLeftRadius: 5,
  backgroundColor: COLORS.cream,
  borderWidth: 1,
  borderColor: COLORS.border,
},

myMessageBubble: {
  backgroundColor: COLORS.secondary,
  borderColor: COLORS.secondary,
  borderBottomLeftRadius: 18,
  borderBottomRightRadius: 5,
},


senderLabel: {
  fontSize: 11,
  fontWeight: '800',
  color: COLORS.main,
  marginBottom: 5,
},

mySenderLabel: {
  color: COLORS.dark,
  textAlign: 'right',
},

messageBody: {
  fontSize: 14,
  lineHeight: 20,
  color: COLORS.text,
},

myMessageBody: {
  color: COLORS.dark,
},

messageTime: {
  fontSize: 9,
  textAlign: 'right',
  marginTop: 5,
  color: COLORS.muted,
},

myMessageTime: {
  color: COLORS.muted,
},
messageStatus: {
  flexDirection: 'row',
  alignItems: 'center',
  marginTop: 3,
  marginRight: 3,
  gap: 3,
},
messageStatusText: {
  color: COLORS.muted,
  fontSize: 10,
},
messageReadStatusText: {
  color: '#477653',
},

  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  stateText: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 9,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.dark,
    marginTop: 15,
  },
  retryButton: {
    backgroundColor: COLORS.main,
    borderRadius: 13,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 18,
  },
  retryText: {
    color: COLORS.white,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: COLORS.light,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 17,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.dark,
  },

  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 45,
    backgroundColor: COLORS.cream,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    fontSize: 14,
    color: COLORS.text,
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: COLORS.main,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
});