
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { getTrailImages } from '../../constants/trailImages';
import { useTrails } from '../../hooks/useTrails';
import { getTracks, syncTracks } from '../../services/trackService';

const API_URL = 'https://hiking-trail-guide-api.vercel.app/api';
const NEARBY_RADIUS_KM = 25;

const COLORS = {
  main: '#694F2E',
  secondary: '#C9AD8A',
  background: '#694F2E',
  card: '#C9AD8A',
  cream: '#F7F0E6',
  white: '#FBF7F0',
  light: '#E8DCCB',
  border: '#B89A75',
  dark: '#352719',
  text: '#352719',
  muted: '#6E573F',
  success: '#477653',
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

  return (
    2 *
    earthRadiusKm *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
}

function formatDuration(seconds) {
  const totalMinutes = Math.floor(
    Math.max(0, Number(seconds) || 0) / 60
  );
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
      if (state === 'active') loadHistory();
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
      await Promise.all([loadHistory(), loadLocation()]);
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
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.main}
            colors={[COLORS.main]}
          />
        }
        contentContainerStyle={styles.content}
      >
        <View style={styles.topHeader}>
          <View style={styles.brandRow}>
            <View style={styles.brandIcon}>
              <Text style={styles.brandIconText}>P</Text>
            </View>
            <View>
              <Text style={styles.brandName}>PEAKLY</Text>
              <Text style={styles.brandCaption}>FIND YOUR WILD</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.headerMapButton}
            onPress={openMap}
            activeOpacity={0.8}
          >
            <Text style={styles.headerMapIcon}>⌖</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.greetingBlock}>
          <Text style={styles.greeting}>READY TO GET OUTSIDE?</Text>
          <Text style={styles.userName}>Your next escape{'\n'}awaits.</Text>
          <Text style={styles.greetingSubtitle}>
            Find a trail. Take a breath. Go further.
          </Text>
        </View>

        <View style={styles.featuredCard}>
          
<View style={styles.featuredArtwork}>
  <Image
    source={getTrailImages(recommendedTrail)[0]}
    style={styles.featuredImage}
    resizeMode="cover"
  />

  <View style={styles.featuredImageOverlay} />

  <View style={styles.featuredTag}>
    <Text style={styles.featuredTagText}>
      ✦ EDITOR'S PICK
    </Text>
  </View>

  <View style={styles.artworkCaption}>
    <Text style={styles.artworkCaptionText}>
      THE GREAT OUTDOORS
    </Text>
  </View>
</View>


          <View style={styles.featuredBody}>
            <Text style={styles.featuredEyebrow}>YOUR NEXT DESTINATION</Text>
            <Text style={styles.featuredTitle}>
              {recommendedTrail?.name ??
                (loading ? 'Finding trails...' : 'Adventure awaits')}
            </Text>
            <Text style={styles.featuredLocation} numberOfLines={1}>
              📍 {recommendedTrail?.region ?? 'Explore somewhere new'}
            </Text>

            <View style={styles.featuredDetails}>
              <View style={styles.featuredDetail}>
                <Text style={styles.detailIcon}>◷</Text>
                <View>
                  <Text style={styles.detailValue}>
                    {recommendedTrail?.duration ?? '—'}
                  </Text>
                  <Text style={styles.detailLabel}>Duration</Text>
                </View>
              </View>

              <View style={styles.detailDivider} />

              <View style={styles.featuredDetail}>
                <Text style={styles.detailIcon}>↗</Text>
                <View>
                  <Text style={styles.detailValue}>
                    {recommendedTrail?.distanceKm != null
                      ? `${recommendedTrail.distanceKm} km`
                      : '—'}
                  </Text>
                  <Text style={styles.detailLabel}>Trail length</Text>
                </View>
              </View>

              <View style={styles.detailDivider} />

              <View style={styles.featuredDetail}>
                <Text style={styles.detailIcon}>♧</Text>
                <View>
                  <Text style={styles.detailValue}>
                    {recommendedTrail?.difficulty ?? '—'}
                  </Text>
                  <Text style={styles.detailLabel}>Difficulty</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.exploreButton,
                !recommendedTrail && styles.disabledButton,
              ]}
              onPress={() => openTrailOnMap(recommendedTrail)}
              disabled={!recommendedTrail}
              activeOpacity={0.8}
            >
              <Text style={styles.exploreButtonText}>Explore this trail</Text>
              <Text style={styles.exploreButtonArrow}>↗</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>MAKE IT HAPPEN</Text>
            <Text style={styles.sectionTitle}>Your next move</Text>
          </View>
        </View> */}

        {/* <View style={styles.actionGrid}>
          <TouchableOpacity
            style={styles.actionTile}
            onPress={openMap}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIcon, styles.actionIconBrown]}>
              <Text style={styles.actionEmoji}>🗺️</Text>
            </View>
            <Text style={styles.actionTitle}>Explore</Text>
            <Text style={styles.actionSubtitle}>Discover trails</Text>
            <Text style={styles.actionArrow}>↗</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionTile}
            onPress={() => openTrailOnMap(recommendedTrail)}
            disabled={!recommendedTrail}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIcon, styles.actionIconSand]}>
              <Text style={styles.actionEmoji}>🥾</Text>
            </View>
            <Text style={styles.actionTitle}>Start hiking</Text>
            <Text style={styles.actionSubtitle}>Plan your route</Text>
            <Text style={styles.actionArrow}>↗</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionTile}
            onPress={openNearbyMap}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIcon, styles.actionIconGreen]}>
              <Text style={styles.actionEmoji}>📍</Text>
            </View>
            <Text style={styles.actionTitle}>Near me</Text>
            <Text style={styles.actionSubtitle}>Local adventures</Text>
            <Text style={styles.actionArrow}>↗</Text>
          </TouchableOpacity>
        </View> */}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>OUTSIDE YOUR DOOR</Text>
            <Text style={styles.sectionTitle}>Trails nearby</Text>
            <Text style={styles.sectionSubtitle}>
              {locationLoading
                ? 'Finding your location...'
                : `Within ${NEARBY_RADIUS_KM} km of you`}
            </Text>
          </View>

          <TouchableOpacity
            onPress={openNearbyMap}
            activeOpacity={0.8}
            style={styles.textLinkButton}
          >
            <Text style={styles.textLink}>View map ↗</Text>
          </TouchableOpacity>
        </View>

        {locationLoading && nearbyTrails.length === 0 ? (
          <View style={styles.statusCard}>
            <ActivityIndicator color={COLORS.main} />
            <Text style={styles.statusText}>Finding trails around you...</Text>
          </View>
        ) : nearbyTrails.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.nearbyScroll}
          >
            {nearbyTrails.map((trail, index) => (
              <TouchableOpacity
                key={trail.id}
                style={styles.nearbyCard}
                activeOpacity={0.85}
                onPress={() => openTrailOnMap(trail)}
              >
                
<View
  style={[
    styles.nearbyArtwork,
    index % 3 === 1 && styles.nearbyArtworkAlt,
    index % 3 === 2 && styles.nearbyArtworkThird,
  ]}
>
  <Image
    source={getTrailImages(trail)[0]}
    style={styles.nearbyImage}
    resizeMode="cover"
  />

  <View style={styles.nearbyImageOverlay} />

  <Text style={styles.nearbyNumber}>
    {String(index + 1).padStart(2, '0')}
  </Text>

  <View style={styles.nearbyDifficulty}>
    <Text style={styles.nearbyDifficultyText}>
      {trail.difficulty ?? 'Unknown'}
    </Text>
  </View>
</View>


                <View style={styles.nearbyCardBody}>
                  <Text style={styles.nearbyName} numberOfLines={2}>
                    {trail.name}
                  </Text>
                  <Text style={styles.nearbyRegion} numberOfLines={1}>
                    {trail.region ?? 'Location unavailable'}
                  </Text>
                  <View style={styles.nearbyCardFooter}>
                    <Text style={styles.nearbyDistance}>
                      {trail.distanceFromUserKm.toFixed(1)} km away
                    </Text>
                    <Text style={styles.nearbyArrow}>↗</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.emptyNearby}>
            <Text style={styles.emptyNearbyIcon}>
              {locationError ? '📍' : '⛰️'}
            </Text>
            <View style={styles.emptyNearbyBody}>
              <Text style={styles.emptyNearbyTitle}>
                {locationError
                  ? 'Location access needed'
                  : error
                  ? 'Trails could not be loaded'
                  : loading
                  ? 'Loading trails'
                  : 'No nearby trails yet'}
              </Text>
              <Text style={styles.emptyNearbyText}>
                {locationError
                  ? 'Allow location access to discover trails close to you.'
                  : error
                  ? "Check your connection and refresh to try again."
                  : loading
                  ? 'We are finding your next adventure.'
                  : `Try exploring the map for trails beyond ${NEARBY_RADIUS_KM} km.`}
              </Text>
              <TouchableOpacity
                onPress={locationError ? openNearbyMap : openMap}
                activeOpacity={0.8}
              >
                <Text style={styles.textLink}>
                  {locationError ? 'Enable location ↗' : 'Explore map ↗'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>EVERY STEP COUNTS</Text>
            <Text style={styles.sectionTitle}>Your journey</Text>
          </View>
          <View style={styles.journeyBadge}>
            <Text style={styles.journeyBadgeText}>TRAIL EXPLORER</Text>
          </View>
        </View>

        <View style={styles.progressCard}>
          <View style={styles.progressBanner}>
            <View style={styles.progressBannerText}>
              <Text style={styles.progressEyebrow}>KEEP MOVING FORWARD</Text>
              <Text style={styles.progressHeadline}>
                The best views come{'\n'}after the hardest climbs.
              </Text>
            </View>
            <Text style={styles.progressMountain}>⛰️</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {completedHikes.length}
              </Text>
              <Text style={styles.statLabel}>Hikes completed</Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {totalDistanceKm.toFixed(1)}
              </Text>
              <Text style={styles.statLabel}>Kilometers</Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {Math.round(totalElevation).toLocaleString()}
              </Text>
              <Text style={styles.statLabel}>Elevation (m)</Text>
            </View>
          </View>

          <View style={styles.timeRow}>
            <View style={styles.timeIcon}>
              <Text>◷</Text>
            </View>
            <View style={styles.timeTextContainer}>
              <Text style={styles.timeLabel}>Time spent on the trail</Text>
              <Text style={styles.timeValue}>
                {formatDuration(totalDurationSeconds)}
              </Text>
            </View>
            <Text style={styles.timeDecoration}>✦</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>YOUR FOOTPRINTS</Text>
            <Text style={styles.sectionTitle}>Recent hikes</Text>
            <Text style={styles.sectionSubtitle}>
              Every adventure has a story.
            </Text>
          </View>

          <TouchableOpacity
            onPress={loadHistory}
            activeOpacity={0.8}
            style={styles.textLinkButton}
          >
            <Text style={styles.textLink}>Refresh ↻</Text>
          </TouchableOpacity>
        </View>

        {historyLoading ? (
          <View style={styles.statusCard}>
            <ActivityIndicator color={COLORS.main} />
            <Text style={styles.statusText}>Loading your adventures...</Text>
          </View>
        ) : historyError && hikingHistory.length === 0 ? (
          <View style={styles.emptyHistory}>
            <Text style={styles.emptyHistoryIcon}>◷</Text>
            <Text style={styles.emptyHistoryTitle}>History unavailable</Text>
            <Text style={styles.emptyHistoryText}>{historyError}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={loadHistory}
              activeOpacity={0.8}
            >
              <Text style={styles.retryButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : hikingHistory.length === 0 ? (
          <View style={styles.emptyHistory}>
            <View style={styles.emptyHistoryIllustration}>
              <Text style={styles.emptyHistoryIcon}>🥾</Text>
            </View>
            <Text style={styles.emptyHistoryTitle}>
              Your story starts here
            </Text>
            <Text style={styles.emptyHistoryText}>
              Your saved GPS hikes will appear here. Pick a trail and make
              your first memory.
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => openTrailOnMap(recommendedTrail)}
              disabled={!recommendedTrail}
              activeOpacity={0.8}
            >
              <Text style={styles.retryButtonText}>Find a trail ↗</Text>
            </TouchableOpacity>
          </View>
        ) : (
          hikingHistory.slice(0, 5).map((hike, index) => {
            const status = getTrackStatus(hike);

            return (
              <TouchableOpacity
                key={String(hike.id ?? `${hike.startedAt}-${index}`)}
                style={styles.historyCard}
                onPress={() => openHikeDetails(hike)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`View details for ${hike.trailName || 'recorded hike'}`}
              >

<View style={styles.historyIcon}>
  <Image
    source={getTrailImages(
      trails.find(
        (trail) => trail.name === hike.trailName
      ) || { name: hike.trailName }
    )[0]}
    style={styles.historyImage}
    resizeMode="cover"
  />

  {status === 'discarded' && (
    <View style={styles.discardedPhotoBadge}>
      <Text style={styles.discardedPhotoBadgeText}></Text>
    </View>
  )}
</View>

                <View style={styles.historyInfo}>
                  <Text style={styles.historyName} numberOfLines={1}>
                    {hike.trailName || 'Recorded Hike'}
                  </Text>
                  <Text style={styles.historyDate}>
                    {formatDate(hike.startedAt)}
                  </Text>
                  <View style={styles.historyStatusRow}>
                    <View
                      style={[
                        styles.statusDot,
                        status === 'discarded' && styles.discardedDot,
                      ]}
                    />
                    <Text style={styles.historyStatus}>
                      {status === 'discarded' ? 'Discarded' : 'Completed'}
                    </Text>
                    {hike.synced === false && (
                      <Text style={styles.pendingSync}> · Sync pending</Text>
                    )}
                  </View>
                </View>

                <View style={styles.historyRight}>
                  <Text style={styles.historyDistance}>
                    {formatDistance(hike.distanceM)}
                  </Text>
                  <Text style={styles.historyDuration}>
                    {formatDuration(hike.durationS)}
                  </Text>
                  <Text style={styles.historyChevron}>›</Text>
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

        <View style={styles.footer}>
          <Text style={styles.footerBrand}>PEAKLY</Text>
          <Text style={styles.footerMessage}>
            Find your path. Leave only footprints.
          </Text>
        </View>
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 30,
  },

  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandIconText: {
    color: COLORS.main,
    fontSize: 23,
    fontWeight: '900',
    fontStyle: 'italic',
  },
  brandName: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 2.5,
    color: COLORS.secondary,
  },
  brandCaption: {
    marginTop: 3,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: COLORS.light,
  },
  headerMapButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.secondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMapIcon: {
    fontSize: 27,
    color: COLORS.main,
    lineHeight: 30,
  },

  greetingBlock: {
    marginBottom: 23,
  },
  greeting: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.8,
    color: COLORS.light,
  },
  userName: {
    marginTop: 10,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: -1.2,
    color: COLORS.cream,
  },
  greetingSubtitle: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.light,
  },

  featuredCard: {
    borderRadius: 22,
    backgroundColor: COLORS.secondary,
    overflow: 'hidden',
    marginBottom: 31,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  featuredArtwork: {
    height: 175,
    backgroundColor: '#BDA17E',
    position: 'relative',
    overflow: 'hidden',
  },
  featuredImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  featuredImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30, 23, 15, 0.12)',
  },
  featuredTag: {
    position: 'absolute',
    top: 14,
    left: 14,
    backgroundColor: COLORS.main,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 8,
  },
  featuredTagText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  artworkCaption: {
    position: 'absolute',
    bottom: 15,
    right: 14,
  },
  artworkCaptionText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  sunCircle: {
    position: 'absolute',
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#F0D6A5',
    top: 27,
    right: 45,
  },
  featuredMountain: {
    position: 'absolute',
    fontSize: 190,
    lineHeight: 210,
    color: '#806548',
    bottom: -54,
    left: 3,
  },
  featuredMountainBack: {
    position: 'absolute',
    fontSize: 155,
    lineHeight: 175,
    color: '#A58A66',
    bottom: -48,
    right: 5,
  },
  artworkGround: {
    position: 'absolute',
    bottom: -42,
    width: '120%',
    height: 80,
    borderRadius: 100,
    backgroundColor: '#536449',
    transform: [{ rotate: '-5deg' }],
  },
  featuredBody: {
    padding: 17,
  },
  featuredEyebrow: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: COLORS.dark,
  },
  featuredTitle: {
    marginTop: 8,
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: COLORS.dark,
  },
  featuredLocation: {
    marginTop: 6,
    fontSize: 11,
    color: COLORS.dark,
  },
  featuredDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 19,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  featuredDetail: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minWidth: 0,
  },
  detailIcon: {
    fontSize: 21,
    color: COLORS.main,
  },
  detailValue: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.dark,
    textTransform: 'capitalize',
  },
  detailLabel: {
    marginTop: 4,
    fontSize: 8,
    color: COLORS.dark,
  },
  detailDivider: {
    height: 30,
    width: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 5,
  },
  exploreButton: {
    marginTop: 16,
    minHeight: 47,
    paddingHorizontal: 15,
    borderRadius: 12,
    backgroundColor: COLORS.main,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exploreButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  exploreButtonArrow: {
    fontSize: 20,
    color: COLORS.secondary,
  },
  disabledButton: {
    opacity: 0.5,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: 15,
  },
  sectionEyebrow: {
    marginBottom: 6,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.6,
    color: COLORS.light,
  },
  sectionTitle: {
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: COLORS.cream,
  },
  sectionSubtitle: {
    marginTop: 5,
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.light,
  },
  textLinkButton: {
    paddingVertical: 8,
    paddingLeft: 8,
  },
  textLink: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.secondary,
  },

  actionGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 31,
  },
  actionTile: {
    flex: 1,
    minWidth: 0,
    minHeight: 145,
    padding: 11,
    backgroundColor: COLORS.secondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    position: 'relative',
  },
  actionIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionIconBrown: {
    backgroundColor: '#E9DFD0',
  },
  actionIconSand: {
    backgroundColor: '#F0E3CC',
  },
  actionIconGreen: {
    backgroundColor: '#E3E9DD',
  },
  actionEmoji: {
    fontSize: 19,
  },
  actionTitle: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    color: COLORS.dark,
  },
  actionSubtitle: {
    marginTop: 4,
    fontSize: 9,
    lineHeight: 13,
    color: COLORS.dark,
  },
  actionArrow: {
    position: 'absolute',
    right: 10,
    top: 13,
    fontSize: 12,
    color: COLORS.main,
  },

  nearbyScroll: {
    paddingBottom: 6,
    paddingRight: 5,
    gap: 12,
  },
  nearbyCard: {
    width: 205,
    borderRadius: 17,
    overflow: 'hidden',
    backgroundColor: COLORS.secondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 25,
  },
  nearbyImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  nearbyImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30, 23, 15, 0.12)',
  },
  nearbyArtwork: {
    height: 110,
    backgroundColor: '#BBA17F',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  nearbyArtworkAlt: {
    backgroundColor: '#899078',
  },
  nearbyArtworkThird: {
    backgroundColor: '#C5A98B',
  },
  nearbyNumber: {
    position: 'absolute',
    top: 8,
    left: 10,
    fontSize: 10,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 1,
  },
  nearbyMountain: {
    fontSize: 66,
    color: '#F4E6CD',
  },
  nearbyDifficulty: {
    position: 'absolute',
    bottom: 9,
    right: 9,
    backgroundColor: 'rgba(53,39,25,0.85)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  nearbyDifficultyText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  nearbyCardBody: {
    padding: 12,
  },
  nearbyName: {
    minHeight: 36,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    color: COLORS.dark,
  },
  nearbyRegion: {
    marginTop: 5,
    fontSize: 10,
    color: COLORS.dark,
  },
  nearbyCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 13,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  nearbyDistance: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.main,
  },
  nearbyArrow: {
    fontSize: 16,
    color: COLORS.main,
  },
  statusCard: {
    minHeight: 100,
    backgroundColor: COLORS.secondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    gap: 10,
    marginBottom: 25,
  },
  statusText: {
    fontSize: 11,
    color: COLORS.dark,
  },
  emptyNearby: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 17,
    borderRadius: 16,
    backgroundColor: COLORS.secondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 25,
  },
  emptyNearbyIcon: {
    fontSize: 28,
  },
  emptyNearbyBody: {
    flex: 1,
  },
  emptyNearbyTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.dark,
  },
  emptyNearbyText: {
    marginTop: 5,
    marginBottom: 9,
    fontSize: 10,
    lineHeight: 15,
    color: COLORS.dark,
  },

  journeyBadge: {
    backgroundColor: COLORS.light,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 7,
  },
  journeyBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.7,
    color: COLORS.main,
  },

  progressCard: {
    borderRadius: 20,
    backgroundColor: COLORS.secondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginBottom: 31,
  },
  progressBanner: {
    minHeight: 137,
    padding: 17,
    backgroundColor: COLORS.main,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  progressBannerText: {
    flex: 1,
  },
  progressEyebrow: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.3,
    color: COLORS.secondary,
  },
  progressHeadline: {
    marginTop: 10,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  progressMountain: {
    fontSize: 52,
    marginLeft: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
    paddingHorizontal: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: COLORS.main,
  },
  statLabel: {
    marginTop: 6,
    fontSize: 8,
    lineHeight: 12,
    textAlign: 'center',
    color: COLORS.dark,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: COLORS.border,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 15,
    marginBottom: 15,
    padding: 12,
    borderRadius: 12,
    backgroundColor: COLORS.light,
  },
  timeIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeTextContainer: {
    flex: 1,
    marginLeft: 10,
  },
  timeLabel: {
    fontSize: 9,
    color: COLORS.dark,
  },
  timeValue: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.dark,
  },
  timeDecoration: {
    fontSize: 20,
    color: COLORS.main,
  },

  emptyHistory: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: COLORS.secondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    marginBottom: 18,
  },
  emptyHistoryIllustration: {
    width: 62,
    height: 62,
    borderRadius: 22,
    backgroundColor: COLORS.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyHistoryIcon: {
    fontSize: 29,
  },
  emptyHistoryTitle: {
    marginTop: 13,
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.dark,
    textAlign: 'center',
  },
  emptyHistoryText: {
    marginTop: 7,
    fontSize: 11,
    lineHeight: 17,
    color: COLORS.dark,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 11,
    backgroundColor: COLORS.main,
    borderRadius: 10,
  },
  retryButtonText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: COLORS.secondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    marginBottom: 9,
  },
  historyIcon: {
    width: 43,
    height: 46,
    borderRadius: 13,
    backgroundColor: '#E8E0D1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardedIcon: {
    backgroundColor: '#F0E0D8',
  },
  historyEmoji: {
    fontSize: 20,
  },
  historyInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 11,
    marginRight: 5,
  },
  historyName: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.dark,
  },
  historyDate: {
    marginTop: 5,
    fontSize: 10,
    color: COLORS.dark,
  },
  historyStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 7,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
    marginRight: 5,
  },
  discardedDot: {
    backgroundColor: '#B66A58',
  },
  historyStatus: {
    fontSize: 9,
    color: COLORS.dark,
  },
  pendingSync: {
    fontSize: 9,
    fontWeight: '800',
    color: '#80571F',
  },
  historyRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  historyDistance: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.main,
  },
  historyDuration: {
    marginTop: 5,
    fontSize: 9,
    color: COLORS.dark,
  },
  historyChevron: {
    marginTop: 2,
    fontSize: 19,
    color: COLORS.main,
  },
  historyImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  discardedPhotoBadge: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B66A58',
  },
  historyFooter: {
    marginTop: 5,
    marginBottom: 15,
    fontSize: 10,
    color: COLORS.light,
    textAlign: 'center',
  },

  footer: {
    alignItems: 'center',
    paddingTop: 25,
    paddingBottom: 10,
  },
  footerMark: {
    width: 31,
    height: 31,
    borderRadius: 10,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerMarkText: {
    fontSize: 18,
    fontWeight: '900',
    fontStyle: 'italic',
    color: COLORS.main,
  },
  footerBrand: {
    marginTop: 8,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.5,
    color: COLORS.secondary,
  },
  footerMessage: {
    marginTop: 5,
    fontSize: 9,
    color: COLORS.light,
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
});