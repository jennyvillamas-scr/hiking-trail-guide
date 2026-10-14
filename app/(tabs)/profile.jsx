
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const API_URL = 'https://hiking-trail-guide-api.vercel.app/api';

const COLORS = {
  main: '#694F2E',
  secondary: '#C9AD8A',
  background: '#F8F4EE',
  surface: '#FFFFFF',
  soft: '#EFE5D8',
  border: '#E6D9C8',
  text: '#382D20',
  muted: '#91816E',
  success: '#54734D',
  warning: '#A67536',
  danger: '#A94C3D',
};

const formatNumber = (value) =>
  Math.round(Number(value) || 0).toLocaleString('en-US');

const formatDistance = (meters) => {
  const km = (Number(meters) || 0) / 1000;
  return Number.isInteger(km) ? String(km) : km.toFixed(1);
};

const formatDate = (date) => {
  if (!date) return 'Date unavailable';

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return 'Date unavailable';
  }

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
};

const formatDuration = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;

  return `${minutes}m`;
};

async function authenticatedRequest(path, options = {}) {
  const token = await SecureStore.getItemAsync('authToken');

  if (!token) {
    throw new Error('Your session has expired. Please log in again.');
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    throw new Error(
      data.message || `Request failed (${response.status}).`
    );
  }

  return data;
}

export default function Profile() {
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [favorites, setFavorites] = useState([]);

  const [profileImage, setProfileImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [editVisible, setEditVisible] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const [choosingPhoto, setChoosingPhoto] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const loadProfile = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);

    setLoadError('');

    try {
      const results = await Promise.all([
        authenticatedRequest('/profile'),
        authenticatedRequest('/tracks'),
        authenticatedRequest('/favorites'),
      ]);

      const profileData = results[0].profile || results[0];
      const trackData = results[1].tracks || [];
      const favoriteData = results[2].favorites || [];

      setProfile(profileData);

      setTracks(
        [...trackData].sort(
          (a, b) =>
            new Date(
              b.savedAt || b.endedAt || b.startedAt || 0
            ) -
            new Date(
              a.savedAt || a.endedAt || a.startedAt || 0
            )
        )
      );

      setFavorites(favoriteData);
      setDisplayName(profileData.displayName || '');
      setUsername(profileData.username || '');

      // Load the profile photo returned by the backend.
      setProfileImage(
  profileData.profilePhoto ||
  profileData.profile_photo ||
  profileData.profile?.profilePhoto ||
  profileData.profile?.profile_photo ||
  null
);
    } catch (error) {
      setLoadError(error.message || 'Unable to load your profile.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const onRefresh = () => {
    setRefreshing(true);
    loadProfile(false);
  };

  const chooseProfilePhoto = async () => {
    if (choosingPhoto) return;

    setChoosingPhoto(true);

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Photo access needed',
          'Allow Verdant to access your photos so you can choose a profile picture.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (result.canceled || !result.assets?.length) return;

      const selectedPhoto = result.assets[0];

      // Resize and compress the image before uploading it.
      const compressedPhoto = await ImageManipulator.manipulateAsync(
        selectedPhoto.uri,
        [{ resize: { width: 512, height: 512 } }],
        {
          compress: 0.55,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      );

      if (!compressedPhoto.base64) {
        throw new Error('Unable to process this image. Please try another photo.');
      }

      const photoData = `data:image/jpeg;base64,${compressedPhoto.base64}`;

      // Save the actual image data through the authenticated backend.
      const data = await authenticatedRequest('/profile/photo', {
        method: 'PUT',
        body: JSON.stringify({
          profilePhoto: photoData,
        }),
      });

      const savedPhoto =
        data.profilePhoto ||
        data.profile?.profilePhoto ||
        photoData;

      setProfileImage(savedPhoto);

      setProfile((previous) => ({
        ...previous,
        profilePhoto: savedPhoto,
      }));

      Alert.alert(
        'Profile photo updated',
        'Your photo has been saved to your account. It can be loaded on other devices when you log in.'
      );
    } catch (error) {
      Alert.alert(
        'Unable to save photo',
        error.message ||
          'Please check your connection and try again.'
      );
    } finally {
      setChoosingPhoto(false);
    }
  };

  const removeProfilePhoto = () => {
    Alert.alert(
      'Remove profile photo',
      'Would you like to remove your profile photo from your account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await authenticatedRequest('/profile/photo', {
                method: 'DELETE',
              });

              setProfileImage(null);

              setProfile((previous) => ({
                ...previous,
                profilePhoto: null,
              }));

              Alert.alert(
                'Photo removed',
                'Your profile photo has been removed from your account.'
              );
            } catch (error) {
              Alert.alert(
                'Unable to remove photo',
                error.message || 'Please try again.'
              );
            }
          },
        },
      ]
    );
  };

  const saveProfile = async () => {
    const cleanName = displayName.trim();
    const cleanUsername = username.trim().replace(/^@/, '');

    if (!cleanName) {
      Alert.alert('Missing name', 'Please enter your display name.');
      return;
    }

    if (!cleanUsername) {
      Alert.alert('Missing username', 'Please enter a username.');
      return;
    }

    setSaving(true);

    try {
      const data = await authenticatedRequest('/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: cleanName,
          username: cleanUsername,
        }),
      });

      const updatedProfile = data.profile || data;

      setProfile((previous) => ({
        ...previous,
        ...updatedProfile,
        displayName: updatedProfile.displayName ?? cleanName,
        username: updatedProfile.username ?? cleanUsername,
      }));

      setDisplayName(updatedProfile.displayName ?? cleanName);
      setUsername(updatedProfile.username ?? cleanUsername);
      setEditVisible(false);

      Alert.alert('Profile updated', 'Your changes have been saved.');
    } catch (error) {
      Alert.alert('Unable to save', error.message);
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    if (loggingOut) return;

    Alert.alert(
      'Log Out',
      'Are you sure you want to log out of your Verdant account?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);

            try {
              await SecureStore.deleteItemAsync('authToken');

              setProfile(null);
              setTracks([]);
              setFavorites([]);
              setProfileImage(null);

              router.replace('/login');
            } catch (error) {
              Alert.alert(
                'Logout failed',
                'Unable to clear your session. Please try again.'
              );
            } finally {
              setLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  const totalDistance = tracks.reduce(
    (sum, track) => sum + (Number(track.distanceM) || 0),
    0
  );

  const totalElevation = tracks.reduce(
    (sum, track) => sum + (Number(track.ascentM) || 0),
    0
  );

  const hikeCount = tracks.length;
  const elevationGoal = 10000;
  const progress = Math.min(totalElevation / elevationGoal, 1);
  const level = Math.floor(totalElevation / 1500) + 1;

  const fullName =
    profile?.displayName ||
    profile?.username ||
    'Trail Explorer';

  const initial = fullName.trim().charAt(0).toUpperCase() || 'T';
  const recentHikes = tracks.slice(0, 5);

  const achievements = [
    {
      icon: '🏔️',
      title: 'Peak Hunter',
      description: `${hikeCount} hikes`,
      earned: hikeCount >= 5,
    },
    {
      icon: '🥾',
      title: 'Trail Walker',
      description: `${formatDistance(totalDistance)} km`,
      earned: totalDistance >= 100000,
    },
    {
      icon: '⛰️',
      title: 'High Ground',
      description: `${formatNumber(totalElevation)} m`,
      earned: totalElevation >= 2500,
    },
  ];

  if (loading && !profile) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.main} />
          <Text style={styles.loadingText}>Loading your profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.main}
          />
        }
      >
        {loadError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Couldn't load everything</Text>
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => loadProfile()}
            >
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.profileCard}>
          <View style={styles.avatarColumn}>
            <TouchableOpacity
              style={styles.avatarContainer}
              onPress={chooseProfilePhoto}
              activeOpacity={0.8}
              disabled={choosingPhoto}
            >
              <View style={styles.avatar}>
                {profileImage ? (
                  <Image
                    source={{ uri: profileImage }}
                    style={styles.avatarImage}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={styles.avatarText}>{initial}</Text>
                )}
              </View>

              <View style={styles.cameraBadge}>
                {choosingPhoto ? (
                  <ActivityIndicator size="small" color={COLORS.surface} />
                ) : (
                  <MaterialCommunityIcons
                    name="camera"
                    size={14}
                    color={COLORS.surface}
                  />
                )}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={chooseProfilePhoto}
              style={styles.changePhotoButton}
              disabled={choosingPhoto}
            >
              <Text style={styles.changePhotoText}>
                {choosingPhoto ? 'Uploading...' : 'Change photo'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.profileInfo}>
            <Text style={styles.name} numberOfLines={2}>
              {fullName}
            </Text>
            <Text style={styles.username} numberOfLines={1}>
              @{profile?.username || 'username'}
            </Text>

            <View style={styles.memberRow}>
              <View style={styles.memberDot} />
              <Text style={styles.memberText}>Trail Explorer</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.editButton}
            onPress={() => {
              setDisplayName(profile?.displayName || '');
              setUsername(profile?.username || '');
              setEditVisible(true);
            }}
          >
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {profileImage ? (
          <TouchableOpacity
            style={styles.removePhotoButton}
            onPress={removeProfilePhoto}
          >
            <MaterialCommunityIcons
              name="trash-can-outline"
              size={14}
              color={COLORS.muted}
            />
            <Text style={styles.removePhotoText}>Remove profile photo</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.statsCard}>
          {[
            { value: formatNumber(hikeCount), label: 'Hikes' },
            { value: formatDistance(totalDistance), label: 'km' },
            {
              value: formatNumber(totalElevation),
              label: 'Elev. Gain (m)',
            },
          ].map((stat, index, list) => (
            <React.Fragment key={stat.label}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
              {index < list.length - 1 ? (
                <View style={styles.statDivider} />
              ) : null}
            </React.Fragment>
          ))}
        </View>

        <View style={styles.levelCard}>
          <View style={styles.levelHeader}>
            <View>
              <Text style={styles.sectionLabel}>HIKING LEVEL</Text>
              <Text style={styles.levelTitle}>Mountain Explorer</Text>
            </View>
            <View style={styles.levelBadge}>
              <Text style={styles.levelBadgeText}>LEVEL {level}</Text>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${progress * 100}%` }]}
            />
          </View>

          <View style={styles.progressLabels}>
            <Text style={styles.progressText}>
              {formatNumber(totalElevation)} / {formatNumber(elevationGoal)} m elevation
            </Text>
            <Text style={styles.progressText}>
              {Math.round(progress * 100)}%
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Achievements</Text>
            <Text style={styles.sectionSubtitle}>Your trail milestones</Text>
          </View>
        </View>

        <View style={styles.achievementRow}>
          {achievements.map((achievement) => (
            <View
              key={achievement.title}
              style={[
                styles.achievementCard,
                !achievement.earned && styles.achievementLocked,
              ]}
            >
              <View style={styles.achievementIcon}>
                <Text>{achievement.icon}</Text>
              </View>
              <Text style={styles.achievementTitle}>{achievement.title}</Text>
              <Text style={styles.achievementText}>
                {achievement.description}
              </Text>
              <Text
                style={[
                  styles.achievementStatus,
                  achievement.earned ? styles.earnedText : styles.lockedText,
                ]}
              >
                {achievement.earned ? 'Achieved' : 'In progress'}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Recent Hikes</Text>
            <Text style={styles.sectionSubtitle}>
              Your recorded trail activity
            </Text>
          </View>
        </View>

        <View style={styles.hikesList}>
          {recentHikes.length > 0 ? (
            recentHikes.map((hike, index) => {
              const distance = Number(hike.distanceM) || 0;
              const elevation = Number(hike.ascentM) || 0;
              const duration = Number(hike.durationS) || 0;
              const date = hike.endedAt || hike.savedAt || hike.startedAt;

              return (
                <View
                  key={String(hike.id || `${hike.trailId}-${index}`)}
                  style={styles.hikeCard}
                >
                  <View style={styles.hikeIcon}>
                    <Text style={styles.hikeEmoji}>🥾</Text>
                  </View>

                  <View style={styles.hikeInfo}>
                    <View style={styles.hikeTop}>
                      <Text style={styles.hikeName} numberOfLines={1}>
                        {hike.trailName || hike.name || 'Recorded hike'}
                      </Text>
                      <Text style={[styles.difficulty, styles.moderate]}>
                        Recorded
                      </Text>
                    </View>

                    <Text style={styles.hikeDate}>{formatDate(date)}</Text>

                    <View style={styles.hikeStats}>
                      <Text style={styles.hikeStat}>
                        {formatDistance(distance)} km
                      </Text>
                      <Text style={styles.separator}>•</Text>
                      <Text style={styles.hikeStat}>
                        +{formatNumber(elevation)} m
                      </Text>
                      <Text style={styles.separator}>•</Text>
                      <Text style={styles.hikeStat}>
                        {formatDuration(duration)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>🥾</Text>
              <Text style={styles.emptyTitle}>No hikes recorded yet</Text>
              <Text style={styles.emptyText}>
                Your recorded hiking tracks will appear here.
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.savedCard}
          activeOpacity={0.8}
          onPress={() => router.push('/(tabs)/favorites')}
        >
          <View style={styles.savedIcon}>
            <MaterialCommunityIcons
              name="heart-outline"
              size={23}
              color={COLORS.main}
            />
          </View>
          <View style={styles.savedInfo}>
            <Text style={styles.savedTitle}>Saved Trails</Text>
            <Text style={styles.savedSubtitle}>
              {favorites.length} {favorites.length === 1 ? 'trail' : 'trails'} saved for later
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        <View style={styles.optionsCard}>
          <TouchableOpacity
            style={styles.option}
            onPress={() =>
              Alert.alert(
                'Notifications',
                'Notification settings are not available yet.'
              )
            }
          >
            <View style={styles.optionIcon}>
              <MaterialCommunityIcons
                name="bell-outline"
                size={19}
                color={COLORS.main}
              />
            </View>
            <Text style={styles.optionText}>Notifications</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <View style={styles.optionDivider} />

          <TouchableOpacity
            style={styles.option}
            onPress={() =>
              Alert.alert(
                'Privacy & Safety',
                'Privacy settings are not available yet.'
              )
            }
          >
            <View style={styles.optionIcon}>
              <MaterialCommunityIcons
                name="shield-lock-outline"
                size={19}
                color={COLORS.main}
              />
            </View>
            <Text style={styles.optionText}>Privacy & Safety</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <View style={styles.optionDivider} />

          <TouchableOpacity
            style={styles.option}
            onPress={() =>
              Alert.alert('About Peakly', 'Peakly • Peak Peaks • v1.0.0')
            }
          >
            <View style={styles.optionIcon}>
              <MaterialCommunityIcons
                name="information-outline"
                size={19}
                color={COLORS.main}
              />
            </View>
            <Text style={styles.optionText}>About Peakly</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <View style={styles.optionDivider} />

          <TouchableOpacity
            style={styles.option}
            onPress={logout}
            disabled={loggingOut}
            activeOpacity={0.7}
          >
            <View style={styles.logoutIcon}>
              {loggingOut ? (
                <ActivityIndicator size="small" color={COLORS.danger} />
              ) : (
                <MaterialCommunityIcons
                  name="logout"
                  size={19}
                  color={COLORS.danger}
                />
              )}
            </View>
            <Text style={styles.logoutText}>
              {loggingOut ? 'Logging out...' : 'Log Out'}
            </Text>
            <Text style={styles.logoutChevron}>›</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>VERDANT • v1.0.0</Text>
        <View style={{ height: 25 }} />
      </ScrollView>

      <Modal
        visible={editVisible}
        transparent
        animationType="slide"
        onRequestClose={() => !saving && setEditVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Edit Profile</Text>
                <Text style={styles.modalSubtitle}>
                  Update your public trail profile
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setEditVisible(false)}
                disabled={saving}
                style={styles.closeButton}
              >
                <Text style={styles.closeText}>×</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.modalPhotoButton}
              onPress={chooseProfilePhoto}
              disabled={choosingPhoto || saving}
            >
              {choosingPhoto ? (
                <ActivityIndicator color={COLORS.main} />
              ) : (
                <MaterialCommunityIcons
                  name="camera-outline"
                  size={18}
                  color={COLORS.main}
                />
              )}
              <Text style={styles.modalPhotoText}>
                {choosingPhoto ? 'Uploading photo...' : 'Change Profile Photo'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.inputLabel}>Display name</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Enter your display name"
              placeholderTextColor={COLORS.muted}
              style={styles.textInput}
              maxLength={60}
              autoCapitalize="words"
              editable={!saving}
            />

            <Text style={styles.inputLabel}>Username</Text>
            <View style={styles.usernameInputContainer}>
              <Text style={styles.atSign}>@</Text>
              <TextInput
                value={username}
                onChangeText={(value) =>
                  setUsername(value.replace(/^@/, '').replace(/\s/g, ''))
                }
                placeholder="Choose a username"
                placeholderTextColor={COLORS.muted}
                style={styles.usernameInput}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={30}
                editable={!saving}
              />
            </View>

            <Text style={styles.helperText}>
              Your username must be unique.
            </Text>

            <TouchableOpacity
              style={[styles.saveButton, saving && styles.disabledButton]}
              onPress={saveProfile}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={COLORS.surface} />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setEditVisible(false)}
              disabled={saving}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 20 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, color: COLORS.muted, fontSize: 12 },
  errorCard: { backgroundColor: '#F8E9E5', borderRadius: 14, padding: 14, marginBottom: 12 },
  errorTitle: { fontSize: 13, fontWeight: '900', color: COLORS.danger },
  errorText: { marginTop: 5, fontSize: 11, lineHeight: 17, color: '#7D4940' },
  retryButton: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, backgroundColor: COLORS.main },
  retryText: { color: COLORS.surface, fontSize: 11, fontWeight: '800' },
  profileCard: { backgroundColor: COLORS.surface, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  avatarColumn: { alignItems: 'center', width: 76 },
  avatarContainer: { position: 'relative' },
  avatar: { width: 62, height: 62, borderRadius: 31, backgroundColor: COLORS.main, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 31 },
  avatarText: { color: COLORS.surface, fontSize: 25, fontWeight: '800' },
  cameraBadge: { position: 'absolute', right: -2, bottom: -2, width: 25, height: 25, borderRadius: 13, backgroundColor: COLORS.main, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.surface },
  changePhotoButton: { marginTop: 7 },
  changePhotoText: { color: COLORS.main, fontSize: 9, fontWeight: '800' },
  removePhotoButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 4, gap: 5 },
  removePhotoText: { color: COLORS.muted, fontSize: 10, fontWeight: '600' },
  profileInfo: { flex: 1, marginLeft: 10, marginRight: 5 },
  name: { fontSize: 16, fontWeight: '900', color: COLORS.text },
  username: { marginTop: 3, fontSize: 10, color: COLORS.muted },
  memberRow: { flexDirection: 'row', alignItems: 'center', marginTop: 7 },
  memberDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.success, marginRight: 5 },
  memberText: { fontSize: 9, fontWeight: '700', color: COLORS.main },
  editButton: { backgroundColor: COLORS.soft, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 9 },
  editText: { fontSize: 10, fontWeight: '800', color: COLORS.main },
  statsCard: { backgroundColor: COLORS.surface, borderRadius: 16, marginTop: 12, paddingVertical: 17, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 19, fontWeight: '900', color: COLORS.main },
  statLabel: { marginTop: 3, fontSize: 9, color: COLORS.muted },
  statDivider: { height: 30, width: 1, backgroundColor: COLORS.border },
  levelCard: { backgroundColor: COLORS.surface, borderRadius: 16, marginTop: 12, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  levelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel: { fontSize: 8, fontWeight: '900', color: COLORS.muted, letterSpacing: 0.8 },
  levelTitle: { marginTop: 4, fontSize: 16, fontWeight: '900', color: COLORS.text },
  levelBadge: { backgroundColor: COLORS.soft, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  levelBadgeText: { fontSize: 9, fontWeight: '900', color: COLORS.main },
  progressTrack: { height: 8, backgroundColor: COLORS.soft, borderRadius: 5, marginTop: 15, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.main, borderRadius: 5 },
  progressLabels: { marginTop: 7, flexDirection: 'row', justifyContent: 'space-between' },
  progressText: { fontSize: 9, color: COLORS.muted },
  sectionHeader: { marginTop: 20, marginBottom: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: COLORS.text },
  sectionSubtitle: { marginTop: 3, fontSize: 10, color: COLORS.muted },
  achievementRow: { flexDirection: 'row', marginHorizontal: -4 },
  achievementCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, padding: 10, marginHorizontal: 4, borderWidth: 1, borderColor: COLORS.border },
  achievementLocked: { opacity: 0.72 },
  achievementIcon: { width: 37, height: 37, borderRadius: 12, backgroundColor: COLORS.soft, justifyContent: 'center', alignItems: 'center' },
  achievementTitle: { marginTop: 8, fontSize: 10, fontWeight: '900', color: COLORS.text },
  achievementText: { marginTop: 3, fontSize: 9, color: COLORS.muted },
  achievementStatus: { marginTop: 6, fontSize: 8, fontWeight: '800' },
  earnedText: { color: COLORS.success },
  lockedText: { color: COLORS.muted },
  hikesList: { marginBottom: 12 },
  hikeCard: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  hikeIcon: { width: 43, height: 43, borderRadius: 13, backgroundColor: COLORS.soft, alignItems: 'center', justifyContent: 'center' },
  hikeEmoji: { fontSize: 19 },
  hikeInfo: { flex: 1, marginLeft: 11 },
  hikeTop: { flexDirection: 'row', alignItems: 'center' },
  hikeName: { flex: 1, fontSize: 12, fontWeight: '800', color: COLORS.text },
  difficulty: { fontSize: 8, fontWeight: '900', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
  easy: { backgroundColor: '#E4F2E9', color: COLORS.success },
  moderate: { backgroundColor: '#F4E7D5', color: COLORS.warning },
  difficult: { backgroundColor: '#FBE6E2', color: COLORS.danger },
  hikeDate: { marginTop: 3, fontSize: 9, color: COLORS.muted },
  hikeStats: { flexDirection: 'row', alignItems: 'center', marginTop: 5, flexWrap: 'wrap' },
  hikeStat: { fontSize: 9, color: COLORS.muted },
  separator: { marginHorizontal: 5, color: COLORS.secondary },
  emptyCard: { backgroundColor: COLORS.surface, borderRadius: 14, alignItems: 'center', padding: 22, borderWidth: 1, borderColor: COLORS.border },
  emptyIcon: { fontSize: 28 },
  emptyTitle: { marginTop: 9, fontSize: 13, fontWeight: '900', color: COLORS.text },
  emptyText: { marginTop: 5, textAlign: 'center', fontSize: 10, lineHeight: 16, color: COLORS.muted },
  savedCard: { backgroundColor: COLORS.surface, borderRadius: 15, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  savedIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: COLORS.soft, justifyContent: 'center', alignItems: 'center' },
  savedInfo: { flex: 1, marginLeft: 11 },
  savedTitle: { fontSize: 12, fontWeight: '900', color: COLORS.text },
  savedSubtitle: { marginTop: 3, fontSize: 9, color: COLORS.muted },
  chevron: { fontSize: 24, color: COLORS.secondary, marginLeft: 6 },
  optionsCard: { backgroundColor: COLORS.surface, borderRadius: 15, marginTop: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.border },
  option: { minHeight: 55, flexDirection: 'row', alignItems: 'center' },
  optionIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.soft, justifyContent: 'center', alignItems: 'center' },
  optionText: { flex: 1, marginLeft: 11, fontSize: 11, fontWeight: '700', color: COLORS.text },
  optionDivider: { height: 1, backgroundColor: COLORS.border },
  logoutIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F8E9E5', justifyContent: 'center', alignItems: 'center' },
  logoutText: { flex: 1, marginLeft: 11, fontSize: 11, fontWeight: '800', color: COLORS.danger },
  logoutChevron: { fontSize: 24, color: COLORS.danger, marginLeft: 6 },
  version: { marginTop: 18, textAlign: 'center', fontSize: 9, color: COLORS.muted, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(40, 30, 18, 0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 23 },
  modalTitle: { fontSize: 21, fontWeight: '900', color: COLORS.main },
  modalSubtitle: { marginTop: 4, fontSize: 11, color: COLORS.muted },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.soft, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 25, lineHeight: 28, color: COLORS.main },
  modalPhotoButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.soft, borderRadius: 11, paddingVertical: 12, marginBottom: 18 },
  modalPhotoText: { fontSize: 12, fontWeight: '800', color: COLORS.main },
  inputLabel: { marginBottom: 7, fontSize: 11, fontWeight: '800', color: COLORS.text },
  textInput: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 12, color: COLORS.text, fontSize: 13, marginBottom: 17 },
  usernameInputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, borderRadius: 11, paddingHorizontal: 13 },
  atSign: { color: COLORS.muted, fontSize: 14, fontWeight: '800' },
  usernameInput: { flex: 1, paddingVertical: 12, paddingLeft: 5, color: COLORS.text, fontSize: 13 },
  helperText: { marginTop: 6, marginBottom: 20, fontSize: 10, color: COLORS.muted },
  saveButton: { backgroundColor: COLORS.main, borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  disabledButton: { opacity: 0.65 },
  saveButtonText: { color: COLORS.surface, fontSize: 12, fontWeight: '900' },
  cancelButton: { alignItems: 'center', paddingVertical: 13, marginTop: 3 },
  cancelButtonText: { color: COLORS.main, fontSize: 12, fontWeight: '800' },
});
