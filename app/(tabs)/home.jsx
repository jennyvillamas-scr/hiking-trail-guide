
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTrails } from '../../hooks/useTrails';
import {
  getTracks,
  syncTracks,
} from '../../services/trackService';

const API_URL = 'https://hiking-trail-guide-api.vercel.app/api';
const NEARBY_RADIUS_KM = 25;

const COLORS = {
  main: '#694F2E',
  secondary: '#C9AD8A',
  background: '#694F2E',
  card: '#C9AD8A',
  light: '#DCC6A9',
  text: '#352719',
  muted: '#6E573F',
  border: '#B99A72',
  success: '#58734B',
};

function getTrailCoordinates(trail) {
  const latitude = Number(trail.latitude ?? trail.lat);
  const longitude = Number(trail.longitude ?? trail.lng ?? trail.lon);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDuration(seconds) {
  const totalMinutes = Math.floor(Math.max(0, Number(seconds) || 0) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDate(dateString) {
  if (!dateString) return 'Date unavailable';

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) return 'Date unavailable';

  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function formatDistance(meters) {
  const km = Math.max(0, Number(meters) || 0) / 1000;

  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(2)} km`;
}

function getTrackStatus(track) {
  return track.status === 'discarded' ? 'discarded' : 'completed';
}

export default function Home() {
  const router = useRouter();
  const { trails = [], error, loading } = useTrails();

  const [userLocation, setUserLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState(false);

  const [hikingHistory, setHikingHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError('');

    let localTracks = [];

    try {
      localTracks = await getTracks();
      setHikingHistory(localTracks);
    } catch (localError) {
      console.error('Could not load local hiking history:', localError);
    }

    try {
      const token = await SecureStore.getItemAsync('authToken');

      if (token) {
        await syncTracks();
      }

      localTracks = await getTracks();
      setHikingHistory(localTracks);

      if (!token) {
        if (localTracks.length === 0) {
          setHistoryError('Please log in to view your hiking history.');
        }
        return;
      }

      const response = await fetch(`${API_URL}/tracks`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(
          data.message || 'Unable to load hiking history from the server.'
        );
      }

      const remoteTracks = Array.isArray(data.tracks)
        ? data.tracks
        : [];

      const localServerIds = new Set(
        localTracks
          .filter((track) => track.serverId != null)
          .map((track) => String(track.serverId))
      );

      const unmatchedRemoteTracks = remoteTracks.filter(
        (track) => !localServerIds.has(String(track.id))
      );

      const combinedTracks = [
        ...localTracks,
        ...unmatchedRemoteTracks,
      ].sort((a, b) => {
        const dateA = new Date(
          a.startedAt || a.savedAt || 0
        ).getTime();

        const dateB = new Date(
          b.startedAt || b.savedAt || 0
        ).getTime();

        return dateB - dateA;
      });

      setHikingHistory(combinedTracks);
      setHistoryError('');
    } catch (historyLoadError) {
      console.error(
        'Could not sync or load hiking history:',
        historyLoadError
      );

      setHikingHistory(localTracks);

      if (localTracks.length === 0) {
        setHistoryError(
          historyLoadError.message || 'Unable to load hiking history.'
        );
      }
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        loadHistory();
      }
    });

    return () => subscription.remove();
  }, [loadHistory]);

  const loadLocation = useCallback(async () => {
    setLocationLoading(true);
    setLocationError(false);

    try {
      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        setUserLocation(null);
        setLocationError(true);
        return null;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      setUserLocation(location);
      return location;
    } catch {
      setLocationError(true);
      setUserLocation(null);
      return null;
    } finally {
      setLocationLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLocation();
  }, [loadLocation]);

  const onRefresh = async () => {
    setRefreshing(true);

    try {
      await loadHistory();
    } finally {
      setRefreshing(false);
    }
  };

  const nearbyTrails = userLocation
    ? trails
        .map((trail) => {
          const coordinates = getTrailCoordinates(trail);
          if (!coordinates) return null;

          const distanceFromUserKm = getDistanceKm(
            userLocation.latitude,
            userLocation.longitude,
            coordinates.latitude,
            coordinates.longitude
          );

          return { ...trail, distanceFromUserKm };
        })
        .filter(
          (trail) =>
            trail !== null &&
            trail.distanceFromUserKm <= NEARBY_RADIUS_KM
        )
        .sort((a, b) => a.distanceFromUserKm - b.distanceFromUserKm)
    : [];

  const recommendedTrail = nearbyTrails[0] ?? trails[0] ?? null;

  const completedHikes = hikingHistory.filter(
    (hike) => getTrackStatus(hike) === 'completed'
  );

  const totalDistanceKm =
    completedHikes.reduce(
      (sum, hike) => sum + (Number(hike.distanceM) || 0),
      0
    ) / 1000;

  const totalDurationSeconds = completedHikes.reduce(
    (sum, hike) => sum + (Number(hike.durationS) || 0),
    0
  );

  const totalElevation = completedHikes.reduce(
    (sum, hike) => sum + (Number(hike.ascentM) || 0),
    0
  );

  const openTrailOnMap = (trail) => {
    if (!trail?.id) return;

    router.push({
      pathname: '/(tabs)/maps',
      params: { trailId: String(trail.id) },
    });
  };

  const openMap = () => router.push('/(tabs)/maps');

  const openNearbyMap = async () => {
    const location = await loadLocation();

    if (!location) {
      Alert.alert(
        'Location required',
        'Allow location permission so the app can find hiking trails near you.'
      );
      return;
    }

    router.push({
      pathname: '/(tabs)/maps',
      params: {
        nearbyOnly: 'true',
        latitude: String(location.latitude),
        longitude: String(location.longitude),
        radiusKm: String(NEARBY_RADIUS_KM),
      },
    });
  };

  const getDifficultyStyle = (difficulty) => {
    const value = String(difficulty ?? '').toLowerCase();

    if (value === 'easy') return styles.easy;

    if (['hard', 'difficult'].includes(value)) {
      return styles.difficult;
    }

    return styles.moderate;
  };

  const openHikeDetails = (hike) => {
    const status = getTrackStatus(hike);

    Alert.alert(
      hike.trailName || 'Recorded Hike',
      `Status: ${status === 'completed' ? 'Completed' : 'Discarded'}\nDate: ${formatDate(
        hike.startedAt
      )}\nDistance: ${formatDistance(
        hike.distanceM
      )}\nDuration: ${formatDuration(
        hike.durationS
      )}\nElevation gain: ${
        hike.ascentM == null
          ? 'Not recorded'
          : `${Math.round(hike.ascentM)} m`
      }\nSync: ${hike.synced === false ? 'Waiting to sync' : 'Saved'}`,
      [{ text: 'Close', style: 'cancel' }]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.content}
      >
        <View style={styles.welcomeRow}>
          <View>
            <Text style={styles.greeting}>YOUR NEXT ADVENTURE STARTS HERE</Text>
            <Text style={styles.userName}>Welcome, Trail Explorer! 🥾</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>RECOMMENDED FOR YOU</Text>

        <View style={styles.heroCard}>
          <View style={styles.heroImage}>
            <Text style={styles.mountainEmoji}>⛰️</Text>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>TOP PICK</Text>
            </View>
          </View>

          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>
              {recommendedTrail?.name ??
                (loading ? 'Loading trails...' : 'No trail available')}
            </Text>

            <Text style={styles.heroLocation}>
              📍 {recommendedTrail?.region ?? 'Trail location unavailable'}
            </Text>

            <View style={styles.ratingRow}>
              <Text style={styles.rating}>
                {recommendedTrail?.difficulty ?? '—'}
              </Text>
              <Text style={styles.ratingText}>Difficulty</Text>
            </View>

            <View style={styles.heroStats}>
              <View>
                <Text style={styles.heroStatValue}>
                  {recommendedTrail?.distanceKm != null
                    ? `${recommendedTrail.distanceKm} km`
                    : '—'}
                </Text>
                <Text style={styles.heroStatLabel}>Distance</Text>
              </View>

              <View>
                <Text style={styles.heroStatValue}>
                  {recommendedTrail?.elevationM != null
                    ? `${recommendedTrail.elevationM} m`
                    : '—'}
                </Text>
                <Text style={styles.heroStatLabel}>Elevation</Text>
              </View>

              <View>
                <Text style={styles.heroStatValue}>
                  {recommendedTrail?.duration ?? '—'}
                </Text>
                <Text style={styles.heroStatLabel}>Est. Time</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.viewTrailButton,
                !recommendedTrail && styles.disabledButton,
              ]}
              onPress={() => openTrailOnMap(recommendedTrail)}
              disabled={!recommendedTrail}
              activeOpacity={0.8}
            >
              <Text style={styles.viewTrailText}>View Trail</Text>
              <Text style={styles.buttonArrow}>→</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Quick Actions</Text>

        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={openMap}
            activeOpacity={0.8}
          >
            <View style={styles.actionIcon}>
              <Text>🗺️</Text>
            </View>
            <Text style={styles.actionTitle}>Explore</Text>
            <Text style={styles.actionSubtitle}>Find trails</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => openTrailOnMap(recommendedTrail)}
            disabled={!recommendedTrail}
            activeOpacity={0.8}
          >
            <View style={styles.actionIcon}>
              <Text>🥾</Text>
            </View>
            <Text style={styles.actionTitle}>Start Hike</Text>
            <Text style={styles.actionSubtitle}>Track route</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={openNearbyMap}
            activeOpacity={0.8}
          >
            <View style={styles.actionIcon}>
              <Text>📍</Text>
            </View>
            <Text style={styles.actionTitle}>Nearby</Text>
            <Text style={styles.actionSubtitle}>Trails nearby</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Nearby Trails</Text>
            <Text style={styles.sectionSubtitle}>
              Within {NEARBY_RADIUS_KM} km of your location
            </Text>
          </View>

          <TouchableOpacity onPress={openNearbyMap} activeOpacity={0.8}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>

        {locationLoading && nearbyTrails.length === 0 ? (
          <View style={styles.locationMessage}>
            <ActivityIndicator color={COLORS.main} />
            <Text style={styles.sectionSubtitle}>Finding your location...</Text>
          </View>
        ) : nearbyTrails.length > 0 ? (
          nearbyTrails.map((trail) => (
            <TouchableOpacity
              key={trail.id}
              style={styles.trailCard}
              activeOpacity={0.8}
              onPress={() => openTrailOnMap(trail)}
            >
              <View style={styles.trailIcon}>
                <Text style={styles.trailEmoji}>🥾</Text>
              </View>

              <View style={styles.trailInfo}>
                <View style={styles.trailTitleRow}>
                  <Text style={styles.trailName}>{trail.name}</Text>
                  <Text
                    style={[
                      styles.difficulty,
                      getDifficultyStyle(trail.difficulty),
                    ]}
                  >
                    {trail.difficulty ?? 'Unknown'}
                  </Text>
                </View>

                <Text style={styles.trailLocation}>
                  {trail.region ?? 'Location unavailable'}
                </Text>

                <View style={styles.trailStats}>
                  <Text style={styles.trailStat}>
                    {trail.distanceKm != null
                      ? `${trail.distanceKm} km trail`
                      : 'Distance —'}
                  </Text>
                  <Text style={styles.separator}>•</Text>
                  <Text style={styles.trailStat}>
                    {trail.distanceFromUserKm.toFixed(1)} km away
                  </Text>
                </View>
              </View>

              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.sectionSubtitle}>
            {locationError
              ? 'Allow location access to find nearby trails.'
              : error
              ? "Couldn't load trails."
              : loading
              ? 'Loading trails...'
              : `No trails found within ${NEARBY_RADIUS_KM} km.`}
          </Text>
        )}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Your Hiking Progress</Text>
            <Text style={styles.sectionSubtitle}>
              Based on your completed GPS recordings
            </Text>
          </View>
        </View>

        <View style={styles.progressCard}>
          <View style={styles.progressTop}>
            <View>
              <Text style={styles.progressLabel}>YOUR JOURNEY</Text>
              <Text style={styles.progressTitle}>Trail Explorer</Text>
            </View>

            <View style={styles.levelBadge}>
              <Text style={styles.levelText}>
                {completedHikes.length}{' '}
                {completedHikes.length === 1 ? 'HIKE' : 'HIKES'}
              </Text>
            </View>
          </View>

          <View style={styles.homeStats}>
            <View style={styles.homeStat}>
              <Text style={styles.homeStatValue}>{completedHikes.length}</Text>
              <Text style={styles.homeStatLabel}>Completed hikes</Text>
            </View>
            <View style={styles.homeStat}>
              <Text style={styles.homeStatValue}>
                {totalDistanceKm.toFixed(1)}
              </Text>
              <Text style={styles.homeStatLabel}>Distance (km)</Text>
            </View>
            <View style={styles.homeStat}>
              <Text style={styles.homeStatValue}>
                {Math.round(totalElevation).toLocaleString()}
              </Text>
              <Text style={styles.homeStatLabel}>Elevation (m)</Text>
            </View>
          </View>

          <Text style={styles.totalTime}>
            Total recorded time: {formatDuration(totalDurationSeconds)}
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Hiking History</Text>
            <Text style={styles.sectionSubtitle}>
              Your latest saved hiking records
            </Text>
          </View>

          <TouchableOpacity
            onPress={loadHistory}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Text style={styles.seeAll}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {historyLoading ? (
          <View style={styles.historyMessage}>
            <ActivityIndicator color={COLORS.main} />
            <Text style={styles.sectionSubtitle}>
              Loading your hiking history...
            </Text>
          </View>
        ) : historyError && hikingHistory.length === 0 ? (
          <View style={styles.emptyHistory}>
            <Text style={styles.emptyHistoryIcon}>⚠️</Text>
            <Text style={styles.emptyHistoryTitle}>History unavailable</Text>
            <Text style={styles.emptyHistoryText}>{historyError}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={loadHistory}
              activeOpacity={0.8}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : hikingHistory.length === 0 ? (
          <View style={styles.emptyHistory}>
            <Text style={styles.emptyHistoryIcon}>🥾</Text>
            <Text style={styles.emptyHistoryTitle}>
              Your journey starts here
            </Text>
            <Text style={styles.emptyHistoryText}>
              Your completed and discarded GPS recordings will appear here
              after they are saved.
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => openTrailOnMap(recommendedTrail)}
              disabled={!recommendedTrail}
              activeOpacity={0.8}
            >
              <Text style={styles.retryButtonText}>Find a Trail</Text>
            </TouchableOpacity>
          </View>
        ) : (
          hikingHistory.slice(0, 5).map((hike, index) => {
            const status = getTrackStatus(hike);

            return (
              <TouchableOpacity
                key={String(hike.id ?? `${hike.startedAt}-${index}`)}
                style={styles.activityCard}
                onPress={() => openHikeDetails(hike)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`View details for ${hike.trailName || 'recorded hike'}`}
              >
                <View style={styles.activityIcon}>
                  <Text>{status === 'discarded' ? '🗑️' : '🥾'}</Text>
                </View>

                <View style={styles.activityInfo}>
                  <Text style={styles.activityName} numberOfLines={1}>
                    {hike.trailName || 'Recorded Hike'}
                  </Text>
                  <Text style={styles.activityDate}>
                    {formatDate(hike.startedAt)}
                  </Text>
                  <Text style={styles.activityMeta}>
                    {formatDuration(hike.durationS)} ·{' '}
                    {status === 'discarded' ? 'Discarded' : 'Completed'}
                  </Text>
                  {hike.synced === false && (
                    <Text style={styles.pendingSync}>Waiting to sync</Text>
                  )}
                </View>

                <View style={styles.activityRight}>
                  <Text style={styles.activityDistance}>
                    {formatDistance(hike.distanceM)}
                  </Text>
                  <Text style={styles.activityTime}>View details ›</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {!historyLoading && hikingHistory.length > 5 && (
          <Text style={styles.historyFooter}>
            Showing your 5 most recent records
          </Text>
        )}
      </ScrollView>
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
    paddingTop: 18,
    paddingBottom: 36,
  },

  welcomeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 26,
  },
  greeting: {
    fontSize: 11,
    color: '#E2D0B8',
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  userName: {
    marginTop: 6,
    fontSize: 25,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  sectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: '#E2D0B8',
    marginBottom: 10,
  },

  heroCard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    overflow: 'hidden',
    elevation: 4,
    marginBottom: 28,
  },
  heroImage: {
    height: 165,
    backgroundColor: COLORS.light,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  mountainEmoji: {
    fontSize: 72,
  },
  heroBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    backgroundColor: COLORS.main,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  heroBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  heroContent: {
    padding: 18,
  },
  heroTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: COLORS.text,
  },
  heroLocation: {
    marginTop: 6,
    fontSize: 11,
    color: COLORS.muted,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 9,
  },
  rating: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.main,
  },
  ratingText: {
    marginLeft: 7,
    fontSize: 10,
    color: COLORS.muted,
  },
  heroStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  heroStatValue: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.text,
  },
  heroStatLabel: {
    marginTop: 4,
    fontSize: 9,
    color: COLORS.muted,
  },
  viewTrailButton: {
    marginTop: 17,
    height: 47,
    borderRadius: 13,
    backgroundColor: COLORS.main,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  viewTrailText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  buttonArrow: {
    marginLeft: 8,
    color: '#FFFFFF',
    fontSize: 17,
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 5,
    letterSpacing: 0.1,
  },
  quickActions: {
    flexDirection: 'row',
    marginHorizontal: -4,
    marginTop: 12,
    marginBottom: 28,
  },
  actionCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 17,
    marginHorizontal: 4,
    paddingVertical: 15,
    paddingHorizontal: 11,
    elevation: 3,
  },
  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.light,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionTitle: {
    marginTop: 11,
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.text,
  },
  actionSubtitle: {
    marginTop: 4,
    fontSize: 9,
    lineHeight: 13,
    color: COLORS.muted,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 13,
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 15,
    color: '#E2D0B8',
  },
  seeAll: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  locationMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
  },

  trailCard: {
    backgroundColor: COLORS.card,
    borderRadius: 17,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
  },
  trailIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: COLORS.light,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trailEmoji: {
    fontSize: 22,
  },
  trailInfo: {
    flex: 1,
    marginLeft: 12,
  },
  trailTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trailName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.text,
  },
  difficulty: {
    fontSize: 8,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    overflow: 'hidden',
  },
  easy: {
    backgroundColor: '#E4EBDD',
    color: '#49613D',
  },
  moderate: {
    backgroundColor: '#F3E5D0',
    color: '#8B632D',
  },
  difficult: {
    backgroundColor: '#F1DEDA',
    color: '#984B3D',
  },
  trailLocation: {
    marginTop: 4,
    fontSize: 9,
    color: COLORS.muted,
  },
  trailStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
  },
  trailStat: {
    fontSize: 9,
    color: COLORS.muted,
  },
  separator: {
    marginHorizontal: 6,
    color: COLORS.secondary,
  },
  chevron: {
    fontSize: 25,
    color: COLORS.main,
    marginLeft: 6,
  },

  progressCard: {
    backgroundColor: COLORS.card,
    borderRadius: 19,
    padding: 18,
    marginTop: 9,
    marginBottom: 28,
    elevation: 3,
  },
  progressTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.muted,
    letterSpacing: 1,
  },
  progressTitle: {
    marginTop: 5,
    fontSize: 17,
    fontWeight: '900',
    color: COLORS.text,
  },
  levelBadge: {
    backgroundColor: COLORS.light,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 11,
  },
  levelText: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.main,
  },
  homeStats: {
    flexDirection: 'row',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  homeStat: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  homeStatValue: {
    fontSize: 17,
    fontWeight: '900',
    color: COLORS.main,
  },
  homeStatLabel: {
    marginTop: 5,
    fontSize: 9,
    color: COLORS.muted,
    textAlign: 'center',
  },
  totalTime: {
    marginTop: 16,
    fontSize: 11,
    color: COLORS.muted,
    textAlign: 'center',
  },

  historyMessage: {
    backgroundColor: COLORS.card,
    borderRadius: 17,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  emptyHistory: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyHistoryIcon: {
    fontSize: 36,
    marginBottom: 9,
  },
  emptyHistoryTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.text,
    textAlign: 'center',
  },
  emptyHistoryText: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 18,
    color: COLORS.muted,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: COLORS.main,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 16,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },

  activityCard: {
    backgroundColor: COLORS.card,
    borderRadius: 17,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
  },
  activityIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.light,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  activityName: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.text,
  },
  activityDate: {
    marginTop: 4,
    fontSize: 9,
    color: COLORS.muted,
  },
  activityMeta: {
    marginTop: 4,
    fontSize: 9,
    color: COLORS.muted,
  },
  pendingSync: {
    marginTop: 5,
    fontSize: 9,
    fontWeight: '900',
    color: '#9A6B2F',
  },
  activityRight: {
    alignItems: 'flex-end',
  },
  activityDistance: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.main,
  },
  activityTime: {
    marginTop: 5,
    fontSize: 9,
    color: COLORS.muted,
  },
  historyFooter: {
    marginTop: 8,
    marginBottom: 14,
    fontSize: 10,
    lineHeight: 15,
    color: '#E2D0B8',
    textAlign: 'center',
  },
});