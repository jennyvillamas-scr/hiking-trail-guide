
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useState } from 'react';
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
import { getTrailImages } from '../../constants/trailImages';
import { getFavorites } from '../../services/favoriteService';

const API_URL = 'https://hiking-trail-guide-api.vercel.app/api';

const COLORS = {
  main: '#694F2E',
  secondary: '#C9AD8A',
  background: '#694F2E',
  surface: '#C9AD8A',
  soft: '#F7F0E6',
  border: '#B89A75',
  darkBrown: '#352719',
  text: '#352719',
  muted: '#6E573F',
  success: '#477653',
  warning: '#9B6A2D',
  danger: '#A94438',
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

const getTrackStatus = (track) =>
  String(track?.status || '').toLowerCase() === 'discarded'
    ? 'discarded'
    : 'completed';

const getHikeName = (hike) =>
  hike?.trailName || hike?.name || 'Recorded hike';

const getHikeImage = (hike) => {
  const trail = {
    name: hike?.trailName || hike?.name || '',
  };

  return getTrailImages(trail)[0];
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
        getFavorites(),
      ]);

      const profileData = results[0].profile || results[0];
      const trackData = results[1].tracks || [];
      const favoriteData = Array.isArray(results[2]) ? results[2] : [];

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

  useFocusEffect(
    useCallback(() => {
      loadProfile(false);
    }, [loadProfile])
  );

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
          'Allow PEAKLY to access your photos so you can choose a profile picture.'
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
        throw new Error(
          'Unable to process this image. Please try another photo.'
        );
      }

      const photoData = `data:image/jpeg;base64,${compressedPhoto.base64}`;

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
        'Your photo has been saved to your account.'
      );
    } catch (error) {
      Alert.alert(
        'Unable to save photo',
        error.message || 'Please check your connection and try again.'
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
                profile_photo: null,
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
      'Are you sure you want to log out of your PEAKLY account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);

            try {
              await SecureStore.deleteItemAsync('authUser');
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
      icon: 'mountain',
      title: 'Peak Hunter',
      description: `${hikeCount} hikes`,
      earned: hikeCount >= 5,
    },
    {
      icon: 'shoe-print',
      title: 'Trail Walker',
      description: `${formatDistance(totalDistance)} km`,
      earned: totalDistance >= 100000,
    },
    {
      icon: 'elevation-rise',
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
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.pageEyebrow}>YOUR OUTDOOR JOURNAL</Text>
            <Text style={styles.pageTitle}>My Profile</Text>
          </View>

          <View style={styles.headerIcon}>
            <MaterialCommunityIcons
              name="compass-outline"
              size={24}
              color={COLORS.main}
            />
          </View>
        </View>

        {loadError ? (
          <View style={styles.errorCard}>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={22}
              color={COLORS.danger}
            />
            <View style={styles.errorInfo}>
              <Text style={styles.errorTitle}>
                Couldn't load everything
              </Text>
              <Text style={styles.errorText}>{loadError}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => loadProfile()}
              >
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={styles.profileCard}>
          <View style={styles.profileTopRow}>
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
                    <ActivityIndicator
                      size="small"
                      color={COLORS.surface}
                    />
                  ) : (
                    <MaterialCommunityIcons
                      name="camera"
                      size={15}
                      color={COLORS.surface}
                    />
                  )}
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.profileInfo}>
              <View style={styles.memberPill}>
                <View style={styles.memberDot} />
                <Text style={styles.memberText}>TRAIL EXPLORER</Text>
              </View>

              <Text style={styles.name} numberOfLines={2}>
                {fullName}
              </Text>

              <Text style={styles.username} numberOfLines={1}>
                @{profile?.username || 'username'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.editButton}
              onPress={() => {
                setDisplayName(profile?.displayName || '');
                setUsername(profile?.username || '');
                setEditVisible(true);
              }}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="pencil-outline"
                size={16}
                color={COLORS.main}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.profileDivider} />

          <View style={styles.profileActions}>
            <TouchableOpacity
              style={styles.changePhotoButton}
              onPress={chooseProfilePhoto}
              disabled={choosingPhoto}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="image-edit-outline"
                size={16}
                color={COLORS.main}
              />
              <Text style={styles.changePhotoText}>
                {choosingPhoto ? 'Uploading...' : 'Change photo'}
              </Text>
            </TouchableOpacity>

            {profileImage ? (
              <TouchableOpacity
                style={styles.removePhotoButton}
                onPress={removeProfilePhoto}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="trash-can-outline"
                  size={16}
                  color={COLORS.danger}
                />
                <Text style={styles.removePhotoText}>Remove</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <View style={styles.statsCard}>
          <View style={styles.stat}>
            <View style={styles.statIcon}>
              <MaterialCommunityIcons
                name="hiking"
                size={18}
                color={COLORS.main}
              />
            </View>
            <Text style={styles.statValue}>
              {formatNumber(hikeCount)}
            </Text>
            <Text style={styles.statLabel}>Hikes</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.stat}>
            <View style={styles.statIcon}>
              <MaterialCommunityIcons
                name="map-marker-distance"
                size={18}
                color={COLORS.main}
              />
            </View>
            <Text style={styles.statValue}>
              {formatDistance(totalDistance)}
            </Text>
            <Text style={styles.statLabel}>Kilometers</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.stat}>
            <View style={styles.statIcon}>
              <MaterialCommunityIcons
                name="trending-up"
                size={18}
                color={COLORS.main}
              />
            </View>
            <Text style={styles.statValue}>
              {formatNumber(totalElevation)}
            </Text>
            <Text style={styles.statLabel}>Elevation (m)</Text>
          </View>
        </View>

        <View style={styles.levelCard}>
          <View style={styles.levelHeader}>
            <View style={styles.levelTitleRow}>
              <View style={styles.levelIcon}>
                <MaterialCommunityIcons
                  name="mountain"
                  size={23}
                  color={COLORS.surface}
                />
              </View>
              <View>
                <Text style={styles.sectionEyebrow}>YOUR PROGRESS</Text>
                <Text style={styles.levelTitle}>Mountain Explorer</Text>
              </View>
            </View>

            <View style={styles.levelBadge}>
              <Text style={styles.levelBadgeLabel}>LEVEL</Text>
              <Text style={styles.levelBadgeNumber}>{level}</Text>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress * 100}%` },
              ]}
            />
          </View>

          <View style={styles.progressLabels}>
            <Text style={styles.progressText}>
              {formatNumber(totalElevation)} /{' '}
              {formatNumber(elevationGoal)} m
            </Text>
            <Text style={styles.progressPercent}>
              {Math.round(progress * 100)}%
            </Text>
          </View>

          <Text style={styles.levelCaption}>
            Keep exploring to reach your next milestone.
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>MILESTONES</Text>
            <Text style={styles.sectionTitle}>Achievements</Text>
            <Text style={styles.sectionSubtitle}>
              Every step takes you further.
            </Text>
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
              <View
                style={[
                  styles.achievementIcon,
                  achievement.earned && styles.achievementIconEarned,
                ]}
              >
                <MaterialCommunityIcons
                  name={achievement.icon}
                  size={23}
                  color={
                    achievement.earned ? COLORS.surface : COLORS.main
                  }
                />
              </View>

              <Text
                style={styles.achievementTitle}
                numberOfLines={2}
              >
                {achievement.title}
              </Text>

              <Text style={styles.achievementText}>
                {achievement.description}
              </Text>

              <View
                style={[
                  styles.achievementStatusPill,
                  achievement.earned
                    ? styles.earnedPill
                    : styles.lockedPill,
                ]}
              >
                <Text
                  style={[
                    styles.achievementStatus,
                    achievement.earned
                      ? styles.earnedText
                      : styles.lockedText,
                  ]}
                >
                  {achievement.earned ? 'Achieved' : 'In progress'}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>YOUR FOOTPRINTS</Text>
            <Text style={styles.sectionTitle}>Recent hikes</Text>
            <Text style={styles.sectionSubtitle}>
              Every adventure has a story.
            </Text>
          </View>

          <View style={styles.hikeCountBadge}>
            <Text style={styles.hikeCountText}>{recentHikes.length}</Text>
          </View>
        </View>

        <View style={styles.hikesList}>
          {recentHikes.length > 0 ? (
            recentHikes.map((hike, index) => {
              const distance = Number(hike.distanceM) || 0;
              const elevation = Number(hike.ascentM) || 0;
              const duration = Number(hike.durationS) || 0;
              const date =
                hike.endedAt || hike.savedAt || hike.startedAt;
              const status = getTrackStatus(hike);

              return (
                <View
                  key={String(
                    hike.id || `${hike.trailId}-${index}`
                  )}
                  style={styles.hikeCard}
                >
                  <View style={styles.hikeImageContainer}>
                    <Image
                      source={getHikeImage(hike)}
                      style={styles.hikeImage}
                      resizeMode="cover"
                    />

                    <View style={styles.hikeImageOverlay} />

                    <View
                      style={[
                        styles.hikeStatusBadge,
                        status === 'discarded'
                          ? styles.discardedBadge
                          : styles.completedBadge,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={
                          status === 'discarded'
                            ? 'close-circle'
                            : 'check-circle'
                        }
                        size={13}
                        color={COLORS.surface}
                      />
                    </View>
                  </View>

                  <View style={styles.hikeInfo}>
                    <View style={styles.hikeTop}>
                      <Text style={styles.hikeName} numberOfLines={2}>
                        {getHikeName(hike)}
                      </Text>
                    </View>

                    <Text style={styles.hikeDate}>
                      <MaterialCommunityIcons
                        name="calendar-month-outline"
                        size={12}
                        color={COLORS.muted}
                      />{' '}
                      {formatDate(date)}
                    </Text>

                    <View style={styles.hikeStats}>
                      <View style={styles.hikeStatItem}>
                        <MaterialCommunityIcons
                          name="map-marker-distance"
                          size={13}
                          color={COLORS.main}
                        />
                        <Text style={styles.hikeStat}>
                          {formatDistance(distance)} km
                        </Text>
                      </View>

                      <View style={styles.hikeStatItem}>
                        <MaterialCommunityIcons
                          name="trending-up"
                          size={13}
                          color={COLORS.main}
                        />
                        <Text style={styles.hikeStat}>
                          +{formatNumber(elevation)} m
                        </Text>
                      </View>

                      <View style={styles.hikeStatItem}>
                        <MaterialCommunityIcons
                          name="clock-outline"
                          size={13}
                          color={COLORS.main}
                        />
                        <Text style={styles.hikeStat}>
                          {formatDuration(duration)}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.statusPill,
                        status === 'discarded'
                          ? styles.discardedPill
                          : styles.completedPill,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          status === 'discarded'
                            ? styles.discardedText
                            : styles.completedText,
                        ]}
                      >
                        {status === 'discarded'
                          ? 'Discarded track'
                          : 'Completed hike'}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconContainer}>
                <MaterialCommunityIcons
                  name="hiking"
                  size={34}
                  color={COLORS.main}
                />
              </View>
              <Text style={styles.emptyTitle}>
                Your story starts here
              </Text>
              <Text style={styles.emptyText}>
                Your recorded hiking tracks will appear here. Choose a
                trail and start your next adventure.
              </Text>
              <TouchableOpacity
                style={styles.exploreButton}
                onPress={() => router.push('/(tabs)/maps')}
                activeOpacity={0.8}
              >
                <Text style={styles.exploreButtonText}>
                  Explore trails
                </Text>
                <MaterialCommunityIcons
                  name="arrow-top-right"
                  size={16}
                  color={COLORS.surface}
                />
              </TouchableOpacity>
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
            <Text style={styles.savedTitle}>Saved trails</Text>
            <Text style={styles.savedSubtitle}>
              {favorites.length}{' '}
              {favorites.length === 1 ? 'trail' : 'trails'} saved for later
            </Text>
          </View>

          <MaterialCommunityIcons
            name="chevron-right"
            size={23}
            color={COLORS.secondary}
          />
        </TouchableOpacity>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>PREFERENCES</Text>
            <Text style={styles.sectionTitle}>Account settings</Text>
          </View>
        </View>

        <View style={styles.optionsCard}>
          <TouchableOpacity
            style={styles.option}
            onPress={() => router.push('/settings/notifications')}
          >
            <View style={styles.optionIcon}>
              <MaterialCommunityIcons
                name="bell-outline"
                size={20}
                color={COLORS.main}
              />
            </View>
            <View style={styles.optionInfo}>
              <Text style={styles.optionText}>Notifications</Text>
              <Text style={styles.optionSubtitle}>
                Manage your alerts
              </Text>
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={22}
              color={COLORS.secondary}
            />
          </TouchableOpacity>

          <View style={styles.optionDivider} />

          <TouchableOpacity
            style={styles.option}
            onPress={() => router.push('/settings/privacy-safety')}
          >
            <View style={styles.optionIcon}>
              <MaterialCommunityIcons
                name="shield-lock-outline"
                size={20}
                color={COLORS.main}
              />
            </View>
            <View style={styles.optionInfo}>
              <Text style={styles.optionText}>Privacy & Safety</Text>
              <Text style={styles.optionSubtitle}>
                Your account and privacy
              </Text>
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={22}
              color={COLORS.secondary}
            />
          </TouchableOpacity>

          <View style={styles.optionDivider} />

          <TouchableOpacity
            style={styles.option}
            onPress={() => router.push('/settings/about')}
          >
            <View style={styles.optionIcon}>
              <MaterialCommunityIcons
                name="information-outline"
                size={20}
                color={COLORS.main}
              />
            </View>
            <View style={styles.optionInfo}>
              <Text style={styles.optionText}>About PEAKLY</Text>
              <Text style={styles.optionSubtitle}>
                Learn about the app
              </Text>
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={22}
              color={COLORS.secondary}
            />
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
                <ActivityIndicator
                  size="small"
                  color={COLORS.danger}
                />
              ) : (
                <MaterialCommunityIcons
                  name="logout"
                  size={20}
                  color={COLORS.danger}
                />
              )}
            </View>

            <View style={styles.optionInfo}>
              <Text style={styles.logoutText}>
                {loggingOut ? 'Logging out...' : 'Log out'}
              </Text>
              <Text style={styles.optionSubtitle}>
                Sign out of your account
              </Text>
            </View>

            {/* <MaterialCommunityIcons
              name="chevron-right"
              size={22}
              color={COLORS.danger}
            /> */}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerMark}>
            {/* <MaterialCommunityIcons
              name="mountain"
              size={22}
              color={COLORS.surface}
            /> */}
          </View>
          {/* <Text style={styles.footerBrand}>PEAKLY</Text> */}
          <Text style={styles.footerMessage}>
            Find your path. Leave only footprints.
          </Text>
          <Text style={styles.version}>VERSION 1.0.0</Text>
        </View>

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
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>YOUR ACCOUNT</Text>
                <Text style={styles.modalTitle}>Edit profile</Text>
                <Text style={styles.modalSubtitle}>
                  Update your public trail profile.
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setEditVisible(false)}
                disabled={saving}
                style={styles.closeButton}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={21}
                  color={COLORS.main}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.modalPhotoButton}
              onPress={chooseProfilePhoto}
              disabled={choosingPhoto || saving}
              activeOpacity={0.8}
            >
              {profileImage ? (
                <Image
                  source={{ uri: profileImage }}
                  style={styles.modalAvatar}
                />
              ) : (
                <View style={styles.modalAvatarPlaceholder}>
                  <MaterialCommunityIcons
                    name="camera-outline"
                    size={23}
                    color={COLORS.main}
                  />
                </View>
              )}

              <View style={styles.modalPhotoInfo}>
                <Text style={styles.modalPhotoText}>
                  {choosingPhoto
                    ? 'Uploading photo...'
                    : 'Change profile photo'}
                </Text>
                <Text style={styles.modalPhotoHint}>
                  Choose a photo from your device
                </Text>
              </View>

              {choosingPhoto ? (
                <ActivityIndicator color={COLORS.main} />
              ) : (
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={22}
                  color={COLORS.secondary}
                />
              )}
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
                  setUsername(
                    value.replace(/^@/, '').replace(/\s/g, '')
                  )
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
              style={[
                styles.saveButton,
                saving && styles.disabledButton,
              ]}
              onPress={saveProfile}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color={COLORS.surface} />
              ) : (
                <>
                  <Text style={styles.saveButtonText}>
                    Save changes
                  </Text>
                  <MaterialCommunityIcons
                    name="check"
                    size={18}
                    color={COLORS.surface}
                  />
                </>
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
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 22,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: COLORS.muted,
    fontSize: 12,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 17,
  },
  pageEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.8,
    color: COLORS.text,
  },
  pageTitle: {
    marginTop: 4,
    fontSize: 27,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.7,
  },
  headerIcon: {
    width: 45,
    height: 45,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F8E9E5',
    borderRadius: 15,
    padding: 14,
    marginBottom: 13,
    gap: 10,
  },
  errorInfo: {
    flex: 1,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.danger,
  },
  errorText: {
    marginTop: 5,
    fontSize: 11,
    lineHeight: 17,
    color: '#7D4940',
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 9,
    backgroundColor: COLORS.main,
  },
  retryText: {
    color: COLORS.surface,
    fontSize: 11,
    fontWeight: '800',
  },
  profileCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#352719',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  profileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarColumn: {
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 25,
    backgroundColor: COLORS.main,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    color: COLORS.surface,
    fontSize: 30,
    fontWeight: '900',
  },
  cameraBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 29,
    height: 29,
    borderRadius: 15,
    backgroundColor: COLORS.main,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.surface,
  },
  profileInfo: {
    flex: 1,
    marginLeft: 15,
    marginRight: 8,
  },
  memberPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAF0E4',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 5,
    marginBottom: 7,
  },
  memberDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
  },
  memberText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.6,
    color: COLORS.success,
  },
  name: {
    fontSize: 17,
    fontWeight: '900',
    color: COLORS.text,
  },
  username: {
    marginTop: 4,
    fontSize: 11,
    color: COLORS.muted,
  },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginTop: 17,
    marginBottom: 10,
  },
  profileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  changePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 7,
  },
  changePhotoText: {
    color: COLORS.main,
    fontSize: 11,
    fontWeight: '800',
  },
  removePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
  },
  removePhotoText: {
    color: COLORS.danger,
    fontSize: 10,
    fontWeight: '700',
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 13,
    paddingVertical: 15,
    paddingHorizontal: 7,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.main,
  },
  statLabel: {
    marginTop: 3,
    fontSize: 9,
    color: COLORS.muted,
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 54,
    backgroundColor: COLORS.border,
  },
  levelCard: {
    backgroundColor: COLORS.darkBrown,
    borderRadius: 21,
    marginTop: 13,
    padding: 17,
  },
  levelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  levelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  levelIcon: {
    width: 45,
    height: 45,
    borderRadius: 14,
    backgroundColor: '#806544',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  sectionEyebrow: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: COLORS.muted,
  },
  levelCardEyebrow: {
    color: COLORS.secondary,
  },
  levelTitle: {
    marginTop: 5,
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.surface,
  },
  levelBadge: {
    minWidth: 55,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.secondary,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  levelBadgeLabel: {
    fontSize: 7,
    fontWeight: '900',
    color: COLORS.darkBrown,
    letterSpacing: 1,
  },
  levelBadgeNumber: {
    marginTop: 1,
    fontSize: 19,
    fontWeight: '900',
    color: COLORS.darkBrown,
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#725A3F',
    borderRadius: 5,
    marginTop: 18,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.secondary,
    borderRadius: 5,
  },
  progressLabels: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 9,
    color: '#E7D9C7',
  },
  progressPercent: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.secondary,
  },
  levelCaption: {
    marginTop: 10,
    fontSize: 10,
    lineHeight: 15,
    color: '#D8C7B1',
  },
  sectionHeader: {
    marginTop: 24,
    marginBottom: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.4,
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 11,
    color: COLORS.muted,
  },
  achievementRow: {
    flexDirection: 'row',
    marginHorizontal: -4,
  },
  achievementCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: COLORS.surface,
    borderRadius: 17,
    padding: 10,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  achievementLocked: {
    backgroundColor: '#F2E9DE',
  },
  achievementIcon: {
    width: 39,
    height: 39,
    borderRadius: 13,
    backgroundColor: COLORS.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  achievementIconEarned: {
    backgroundColor: COLORS.main,
  },
  achievementTitle: {
    marginTop: 10,
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.text,
    minHeight: 25,
  },
  achievementText: {
    marginTop: 3,
    fontSize: 9,
    color: COLORS.muted,
  },
  achievementStatusPill: {
    alignSelf: 'flex-start',
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginTop: 9,
  },
  earnedPill: {
    backgroundColor: '#E5EEE0',
  },
  lockedPill: {
    backgroundColor: '#E8DCCB',
  },
  achievementStatus: {
    fontSize: 8,
    fontWeight: '800',
  },
  earnedText: {
    color: COLORS.success,
  },
  lockedText: {
    color: COLORS.muted,
  },
  hikeCountBadge: {
    width: 35,
    height: 35,
    borderRadius: 12,
    backgroundColor: COLORS.main,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hikeCountText: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.surface,
  },
  hikesList: {
    marginBottom: 5,
  },
  hikeCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 17,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#352719',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.035,
    shadowRadius: 6,
    elevation: 1,
  },
  hikeImageContainer: {
    width: 104,
    height: 119,
    borderRadius: 12,
    backgroundColor: COLORS.soft,
    overflow: 'hidden',
    position: 'relative',
  },
  hikeImage: {
    width: '100%',
    height: '100%',
  },
  hikeImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(40, 29, 16, 0.08)',
  },
  hikeStatusBadge: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 25,
    height: 25,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedBadge: {
    backgroundColor: COLORS.success,
  },
  discardedBadge: {
    backgroundColor: COLORS.danger,
  },
  hikeInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
    justifyContent: 'center',
  },
  hikeTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  hikeName: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    color: COLORS.text,
  },
  hikeDate: {
    marginTop: 7,
    fontSize: 10,
    color: COLORS.muted,
  },
  hikeStats: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 10,
    rowGap: 6,
    marginTop: 10,
  },
  hikeStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hikeStat: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.muted,
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
    marginTop: 9,
  },
  completedPill: {
    backgroundColor: '#E5EEE0',
  },
  discardedPill: {
    backgroundColor: '#F8E5E1',
  },
  statusPillText: {
    fontSize: 8,
    fontWeight: '900',
  },
  completedText: {
    color: COLORS.success,
  },
  discardedText: {
    color: COLORS.danger,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 19,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 27,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyIconContainer: {
    width: 62,
    height: 62,
    borderRadius: 21,
    backgroundColor: COLORS.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    marginTop: 13,
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.text,
    textAlign: 'center',
  },
  emptyText: {
    marginTop: 7,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 18,
    color: COLORS.muted,
  },
  exploreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: COLORS.main,
    borderRadius: 11,
    paddingHorizontal: 16,
    paddingVertical: 11,
    marginTop: 16,
  },
  exploreButtonText: {
    color: COLORS.surface,
    fontSize: 11,
    fontWeight: '900',
  },
  savedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 11,
  },
  savedIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: COLORS.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedInfo: {
    flex: 1,
    marginLeft: 12,
  },
  savedTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.text,
  },
  savedSubtitle: {
    marginTop: 4,
    fontSize: 10,
    color: COLORS.muted,
  },
  optionsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 19,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  option: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  optionText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.text,
  },
  optionSubtitle: {
    marginTop: 4,
    fontSize: 10,
    color: COLORS.muted,
  },
  optionDivider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  logoutIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#F8E9E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.danger,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 8,
  },
  footerMark: {
    width: 43,
    height: 43,
    borderRadius: 15,
    backgroundColor: COLORS.main,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBrand: {
    marginTop: 9,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 3,
    color: COLORS.main,
  },
  footerMessage: {
    marginTop: 5,
    fontSize: 10,
    color: COLORS.text,
  },
  version: {
    marginTop: 10,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: COLORS.secondary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(40, 30, 18, 0.52)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 27,
    borderTopRightRadius: 27,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 30,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.secondary,
    marginBottom: 21,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 21,
  },
  modalEyebrow: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: COLORS.muted,
  },
  modalTitle: {
    marginTop: 5,
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.text,
  },
  modalSubtitle: {
    marginTop: 5,
    fontSize: 11,
    color: COLORS.muted,
  },
  closeButton: {
    width: 37,
    height: 37,
    borderRadius: 13,
    backgroundColor: COLORS.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 11,
    marginBottom: 20,
  },
  modalAvatar: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: COLORS.soft,
  },
  modalAvatarPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: COLORS.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPhotoInfo: {
    flex: 1,
    marginLeft: 11,
  },
  modalPhotoText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.main,
  },
  modalPhotoHint: {
    marginTop: 4,
    fontSize: 9,
    color: COLORS.muted,
  },
  inputLabel: {
    marginBottom: 7,
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.text,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: COLORS.text,
    fontSize: 13,
    marginBottom: 17,
  },
  usernameInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: 13,
    paddingHorizontal: 14,
  },
  atSign: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: '900',
  },
  usernameInput: {
    flex: 1,
    paddingVertical: 13,
    paddingLeft: 6,
    color: COLORS.text,
    fontSize: 13,
  },
  helperText: {
    marginTop: 7,
    marginBottom: 20,
    fontSize: 10,
    color: COLORS.muted,
  },
  saveButton: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: COLORS.main,
    borderRadius: 13,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.65,
  },
  saveButtonText: {
    color: COLORS.surface,
    fontSize: 12,
    fontWeight: '900',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 3,
  },
  cancelButtonText: {
    color: COLORS.main,
    fontSize: 12,
    fontWeight: '900',
  },
});
