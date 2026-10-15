import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TrailMarker } from '../../components/TrailBubble';
import TrailSheet from '../../components/TrailSheet';
import { OSM_STYLE } from '../../constants/mapStyle';
import { INITIAL_REGION } from '../../constants/trailConfig';
import { useTrails } from '../../hooks/useTrails';
import {
  addFavorite,
  getFavorites,
  removeFavorite,
} from '../../services/favoriteService';

const DIFFICULTY_FILTERS = ['All', 'Easy', 'Moderate', 'Hard'];

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

function getInitialZoom() {
  const latitudeDelta = Number(INITIAL_REGION.latitudeDelta) || 20;
  const longitudeDelta = Number(INITIAL_REGION.longitudeDelta) || 20;

  return Math.max(
    2,
    Math.min(14, Math.log2(360 / Math.max(latitudeDelta, longitudeDelta)))
  );
}

function getBoundsView(trails) {
  if (!trails.length) return null;

  const coordinates = trails
    .map(getTrailCoordinates)
    .filter(Boolean);

  if (!coordinates.length) return null;

  const minLat = Math.min(...coordinates.map((item) => item.latitude));
  const maxLat = Math.max(...coordinates.map((item) => item.latitude));
  const minLon = Math.min(...coordinates.map((item) => item.longitude));
  const maxLon = Math.max(...coordinates.map((item) => item.longitude));

  const latitude = (minLat + maxLat) / 2;
  const longitude = (minLon + maxLon) / 2;

  const latitudeSpan = Math.max(maxLat - minLat, 0.01);
  const longitudeSpan = Math.max(maxLon - minLon, 0.01);
  const span = Math.max(latitudeSpan, longitudeSpan);

  const zoom = Math.max(
    2,
    Math.min(13, Math.log2(360 / (span * 1.6)))
  );

  return {
    center: [longitude, latitude],
    zoom,
  };
}

export default function MapsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const cameraRef = useRef(null);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [selectedTrailId, setSelectedTrailId] = useState(null);

  const [cameraView, setCameraView] = useState({
    center: [
      Number(INITIAL_REGION.longitude) || 121.774,
      Number(INITIAL_REGION.latitude) || 12.8797,
    ],
    zoom: getInitialZoom(),
  });

  const {
    trails = [],
    loading,
    error,
    refetch,
  } = useTrails();

  const requestedTrailId = Array.isArray(params.trailId)
    ? params.trailId[0]
    : params.trailId;

  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [handledTrailId, setHandledTrailId] = useState(null);

  const [locationLoading, setLocationLoading] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [favoriteLoading, setFavoriteLoading] = useState(false);

  const loadFavorites = useCallback(async () => {
    try {
      const savedFavorites = await getFavorites();

      const ids = (
        Array.isArray(savedFavorites) ? savedFavorites : []
      )
        .map((trail) => String(trail.id ?? trail.trailId))
        .filter((id) => id !== 'undefined' && id !== 'null');

      setFavoriteIds(ids);
    } catch (e) {
      console.error('Unable to load favorites:', e);
    }
  }, []);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const toggleFavorite = useCallback(
    async (trail) => {
      if (trail?.id == null || favoriteLoading) return;

      const trailId = String(trail.id);
      const alreadyFavorite = favoriteIds.includes(trailId);

      setFavoriteLoading(true);

      try {
        if (alreadyFavorite) {
          await removeFavorite(trail.id);
          setFavoriteIds((previous) =>
            previous.filter((id) => id !== trailId)
          );
        } else {
          await addFavorite(trail);
          setFavoriteIds((previous) =>
            previous.includes(trailId)
              ? previous
              : [...previous, trailId]
          );
        }
      } catch (e) {
        console.error('Unable to update favorite:', e);

        Alert.alert(
          'Unable to update favorite',
          'The trail could not be saved or removed. Please try again.'
        );

        await loadFavorites();
      } finally {
        setFavoriteLoading(false);
      }
    },
    [favoriteIds, favoriteLoading, loadFavorites]
  );

  const validTrails = useMemo(
    () =>
      trails
        .map((trail) => {
          const coordinates = getTrailCoordinates(trail);

          if (!coordinates) return null;

          return {
            ...trail,
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
          };
        })
        .filter(Boolean),
    [trails]
  );

  const visibleTrails = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return validTrails.filter((trail) => {
      const difficulty = String(trail.difficulty ?? '').toLowerCase();

      const matchesDifficulty =
        filter === 'All' ||
        difficulty === filter.toLowerCase() ||
        (filter === 'Hard' && difficulty === 'difficult');

      const matchesSearch =
        !normalizedSearch ||
        String(trail.name ?? '').toLowerCase().includes(normalizedSearch) ||
        String(trail.region ?? '').toLowerCase().includes(normalizedSearch);

      return matchesDifficulty && matchesSearch;
    });
  }, [validTrails, filter, search]);

  const moveCamera = useCallback((view, duration = 650) => {
    if (!view) return;

    setCameraView(view);

    requestAnimationFrame(() => {
      cameraRef.current?.flyTo({
        center: view.center,
        zoom: view.zoom,
        duration,
      });
    });
  }, []);

  const fitTrails = useCallback(
    (items) => {
      const view = getBoundsView(items);

      if (view) {
        moveCamera(view);
      }
    },
    [moveCamera]
  );

  useEffect(() => {
    if (!mapReady || loading || validTrails.length === 0) return;

    if (requestedTrailId) {
      const targetTrail = validTrails.find(
        (trail) => String(trail.id) === String(requestedTrailId)
      );

      if (
        targetTrail &&
        handledTrailId !== String(requestedTrailId)
      ) {
        setFilter('All');
        setSearch('');
        setSelected(targetTrail);
        setSelectedTrailId(String(targetTrail.id));

        moveCamera({
          center: [
            targetTrail.longitude,
            targetTrail.latitude,
          ],
          zoom: 14,
        });

        setHandledTrailId(String(requestedTrailId));
        return;
      }
    }

    fitTrails(validTrails);
  }, [
    mapReady,
    loading,
    validTrails,
    requestedTrailId,
    handledTrailId,
    fitTrails,
    moveCamera,
  ]);

  const selectTrail = useCallback(
    (trail) => {
      setSelected(trail);
      setSelectedTrailId(String(trail.id));

      const coordinates = getTrailCoordinates(trail);

      if (coordinates) {
        moveCamera({
          center: [
            coordinates.longitude,
            coordinates.latitude,
          ],
          zoom: 14,
        });
      }
    },
    [moveCamera]
  );

  const getCurrentLocation = useCallback(async () => {
    try {
      setLocationLoading(true);

      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        Alert.alert(
          'Location permission required',
          'Allow location access to show your current position.'
        );
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      setUserLocation(coordinates);

      moveCamera({
        center: [
          coordinates.longitude,
          coordinates.latitude,
        ],
        zoom: 14,
      });
    } catch (e) {
      Alert.alert(
        'Unable to get location',
        'Please check that your phone location services are enabled and try again.'
      );
    } finally {
      setLocationLoading(false);
    }
  }, [moveCamera]);

  const showAll = useCallback(() => {
    setSelected(null);
    setSelectedTrailId(null);
    setSearch('');
    setFilter('All');

    if (validTrails.length > 0) {
      fitTrails(validTrails);
    } else if (typeof refetch === 'function') {
      refetch();
    }
  }, [validTrails, fitTrails, refetch]);

  const retry = useCallback(() => {
    setMapError(null);

    if (typeof refetch === 'function') {
      refetch();
    }
  }, [refetch]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        <Map
          style={styles.map}
          mapStyle={OSM_STYLE}
          onDidFinishLoadingMap={() => {
            setMapReady(true);
            setMapError(null);
          }}
          onDidFailLoadingMap={() => {
            setMapError('Unable to load the map.');
          }}
          logo={false}
          attribution
        >
          <Camera
            ref={cameraRef}
            initialViewState={cameraView}
            animationMode="flyTo"
            animationDuration={650}
          />

          {visibleTrails.map((trail) => (
            <TrailMarker
              key={String(trail.id)}
              trail={trail}
              selected={selectedTrailId === String(trail.id)}
              onPress={() => selectTrail(trail)}
            />
          ))}

          {userLocation && (
            <Marker
              id="current-user-location"
              lngLat={[userLocation.longitude, userLocation.latitude]}
              anchor="center"
            >
              <View
                accessible
                accessibilityLabel="Your current location"
                style={styles.userLocationHalo}
              >
                <View style={styles.userLocationDot} />
              </View>
            </Marker>
          )}
        </Map>

        <View style={styles.topPanel}>
          <View style={styles.searchBox}>
            <MaterialCommunityIcons
              name="magnify"
              size={22}
              color="#694F2E"
            />

            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search all hiking trails..."
              placeholderTextColor="#8D785F"
              returnKeyType="search"
            />

            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <MaterialCommunityIcons
                  name="close-circle"
                  size={20}
                  color="#8D785F"
                />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersRow}
          >
            {DIFFICULTY_FILTERS.map((item) => {
              const active = filter === item;

              return (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.filterChip,
                    active && styles.filterChipActive,
                  ]}
                  onPress={() => setFilter(item)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.filterText,
                      active && styles.filterTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.resultBadge}>
            <Text style={styles.resultText}>
              {visibleTrails.length}{' '}
              {visibleTrails.length === 1 ? 'trail found' : 'trails found'}
            </Text>
          </View>
        </View>

        <View style={styles.mapControls}>
          <TouchableOpacity
            style={styles.mapControlButton}
            onPress={getCurrentLocation}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Center on my location"
          >
            {locationLoading ? (
              <ActivityIndicator size="small" color="#694F2E" />
            ) : (
              <MaterialCommunityIcons
                name="crosshairs-gps"
                size={23}
                color="#694F2E"
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mapControlButton}
            onPress={showAll}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Show all trails"
          >
            <MaterialCommunityIcons
              name="map-marker-multiple"
              size={23}
              color="#694F2E"
            />
          </TouchableOpacity>
        </View>

        {loading && trails.length === 0 && (
          <View style={styles.messageCard}>
            <ActivityIndicator color="#694F2E" />
            <Text style={styles.messageText}>Loading all trails...</Text>
          </View>
        )}

        {error && trails.length === 0 && (
          <View style={styles.messageCard}>
            <Text style={styles.messageText}>Couldn't load trails.</Text>
            <TouchableOpacity onPress={retry}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {mapError && (
          <View style={styles.mapErrorCard}>
            <Text style={styles.emptyTitle}>Map couldn't load</Text>
            <Text style={styles.emptyText}>
              Check your internet connection and try again.
            </Text>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={retry}
            >
              <Text style={styles.clearButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && trails.length > 0 && validTrails.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Trail coordinates unavailable</Text>
            <Text style={styles.emptyText}>
              Trails were received, but none has valid map coordinates.
            </Text>
          </View>
        )}

        {!loading && trails.length > 0 && visibleTrails.length === 0 && (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons
              name="map-search-outline"
              size={28}
              color="#694F2E"
            />
            <Text style={styles.emptyTitle}>No trails match your filters</Text>
            <Text style={styles.emptyText}>
              Try another search or show all trails.
            </Text>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={showAll}
            >
              <Text style={styles.clearButtonText}>Show all trails</Text>
            </TouchableOpacity>
          </View>
        )}

        <TrailSheet
          trail={selected}
          onClose={() => {
            setSelected(null);
            setSelectedTrailId(null);
          }}
          isFavorite={
            selected ? favoriteIds.includes(String(selected.id)) : false
          }
          onToggleFavorite={toggleFavorite}
          favoriteLoading={favoriteLoading}
          onGetDirections={(trail) => {
            router.push({
              pathname: '/(tabs)/livetopo',
              params: {
                trailId: String(trail.id),
              },
            });
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F0E6',
  },
  container: {
    flex: 1,
    backgroundColor: '#F7F0E6',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  userLocationHalo: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(51, 181, 229, 0.24)',
    borderWidth: 1,
    borderColor: 'rgba(51, 181, 229, 0.4)',
  },
  userLocationDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#168FE5',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    elevation: 3,
  },
  topPanel: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
  },
  searchBox: {
    minHeight: 50,
    backgroundColor: '#FBF7F0',
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C9AD8A',
    elevation: 5,
    shadowColor: '#352719',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    paddingVertical: 11,
    fontSize: 13,
    color: '#352719',
  },
  filtersRow: {
    paddingTop: 10,
    paddingBottom: 6,
    gap: 8,
  },
  filterChip: {
    backgroundColor: '#FBF7F0',
    borderWidth: 1,
    borderColor: '#C9AD8A',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    elevation: 2,
  },
  filterChipActive: {
    backgroundColor: '#694F2E',
    borderColor: '#C9AD8A',
  },
  filterText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#694F2E',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  resultBadge: {
    alignSelf: 'flex-start',
    marginTop: 5,
    marginBottom: 5,
    backgroundColor: '#694F2E',
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#C9AD8A',
    elevation: 3,
  },
  resultText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  mapControls: {
    position: 'absolute',
    right: 14,
    bottom: 145,
    gap: 10,
  },
  mapControlButton: {
    width: 47,
    height: 47,
    borderRadius: 15,
    backgroundColor: '#FBF7F0',
    borderWidth: 1,
    borderColor: '#C9AD8A',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#352719',
    shadowOpacity: 0.15,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  messageCard: {
    position: 'absolute',
    alignSelf: 'center',
    top: '44%',
    backgroundColor: '#FBF7F0',
    borderWidth: 1,
    borderColor: '#C9AD8A',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    maxWidth: '85%',
    elevation: 5,
    gap: 9,
  },
  messageText: {
    color: '#352719',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  retryText: {
    color: '#694F2E',
    fontSize: 12,
    fontWeight: '900',
    padding: 6,
  },
  emptyCard: {
    position: 'absolute',
    bottom: 35,
    left: 20,
    right: 20,
    backgroundColor: '#FBF7F0',
    borderWidth: 1,
    borderColor: '#C9AD8A',
    borderRadius: 20,
    padding: 21,
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#352719',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  mapErrorCard: {
    position: 'absolute',
    top: '42%',
    left: 24,
    right: 24,
    backgroundColor: '#FBF7F0',
    borderWidth: 1,
    borderColor: '#C9AD8A',
    borderRadius: 20,
    padding: 21,
    alignItems: 'center',
    elevation: 5,
  },
  emptyTitle: {
    marginTop: 9,
    fontSize: 16,
    fontWeight: '900',
    color: '#694F2E',
    textAlign: 'center',
  },
  emptyText: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 18,
    textAlign: 'center',
    color: '#6E573F',
  },
  clearButton: {
    marginTop: 14,
    paddingHorizontal: 17,
    paddingVertical: 10,
    backgroundColor: '#694F2E',
    borderRadius: 11,
  },
  clearButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
});