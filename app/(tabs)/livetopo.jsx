import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  Marker,
} from '@maplibre/maplibre-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OSM_STYLE } from '../../constants/mapStyle';
import { useTrails } from '../../hooks/useTrails';
import { saveTrack } from '../../services/trackService';

const OFFLINE_TRAILS_KEY = '@peakly_downloaded_trails';

const COLORS = {
  primary: '#694F2E',
  secondary: '#C9AD8A',
  background: '#F7F0E6',
  card: '#FBF7F0',
  border: '#E8DCCB',
  blue: '#2563EB',
  green: '#22C55E',
  red: '#DC2626',
  amber: '#F59E0B',
  text: '#332719',
  muted: '#66736B',
  white: '#FFFFFF',
};

const DEFAULT_REGION = {
  latitude: 10.3157,
  longitude: 123.8854,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

const ROUTING_BASE_URL =
  'https://routing.openstreetmap.de/routed-foot/route/v1/driving';

const ROUTING_USER_AGENT = 'HikingApp/1.0 (Expo React Native)';
const ROUTE_TIMEOUT_MS = 12000;
const ARRIVAL_METERS = 25;
const MAX_ACCEPTED_ACCURACY_M = 100;
const MAX_RECORD_ACCURACY_M = 30;
const MIN_RECORD_STEP_M = 4;
const MAX_RECORD_SPEED_MPS = 15;
const ALTITUDE_THRESHOLD_M = 3;
const MAX_OFFLINE_ROUTE_POINTS = 600;
const EARTH_RADIUS_M = 6371000;

const toRad = (degrees) => (degrees * Math.PI) / 180;

function distanceMeters(a, b) {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_M *
    Math.asin(Math.min(1, Math.sqrt(h)))
  );
}

function distanceToSegmentMeters(point, a, b) {
  const metersPerDegree = (EARTH_RADIUS_M * Math.PI) / 180;
  const metersPerLongitude =
    metersPerDegree * Math.cos(toRad(point.latitude));

  const ax = (a.longitude - point.longitude) * metersPerLongitude;
  const ay = (a.latitude - point.latitude) * metersPerDegree;
  const bx = (b.longitude - point.longitude) * metersPerLongitude;
  const by = (b.latitude - point.latitude) * metersPerDegree;

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;

  let t =
    lengthSquared === 0
      ? 0
      : -(ax * dx + ay * dy) / lengthSquared;

  t = Math.max(0, Math.min(1, t));

  return Math.sqrt(
    (ax + t * dx) ** 2 + (ay + t * dy) ** 2
  );
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '--';
  if (meters < 1000) return `${Math.round(meters)} m`;

  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--';

  const totalMinutes = Math.max(1, Math.round(seconds / 60));

  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

function formatClock(milliseconds) {
  const totalSeconds = Math.max(
    0,
    Math.floor((milliseconds || 0) / 1000)
  );

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return hours
    ? `${hours}:${mm}:${ss}`
    : `${mm}:${ss}`;
}

async function fetchFootRoute(from, to, signal) {
  const url =
    `${ROUTING_BASE_URL}/` +
    `${from.longitude.toFixed(6)},${from.latitude.toFixed(6)};` +
    `${to.longitude.toFixed(6)},${to.latitude.toFixed(6)}` +
    '?overview=full&geometries=geojson&steps=false&alternatives=false';

  const response = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/json',
      'User-Agent': ROUTING_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Routing HTTP ${response.status}`);
  }

  const json = await response.json();
  const route = json?.routes?.[0];
  const rawCoordinates = route?.geometry?.coordinates;

  if (
    json?.code !== 'Ok' ||
    !Array.isArray(rawCoordinates) ||
    rawCoordinates.length < 2
  ) {
    throw new Error(json?.code || 'No route found');
  }

  const coordinates = rawCoordinates.map(([longitude, latitude]) => ({
    latitude,
    longitude,
  }));

  const last = coordinates[coordinates.length - 1];

  if (distanceMeters(last, to) > 8) {
    coordinates.push({
      latitude: to.latitude,
      longitude: to.longitude,
    });
  }

  const cumulative = [0];

  for (let i = 1; i < coordinates.length; i += 1) {
    cumulative.push(
      cumulative[i - 1] +
        distanceMeters(coordinates[i - 1], coordinates[i])
    );
  }

  return {
    coordinates,
    cumulative,
    totalM: cumulative[cumulative.length - 1],
    durationS: Number(route.duration) || 0,
  };
}

function buildRouteMetrics(inputCoordinates, durationS = 0) {
  if (!Array.isArray(inputCoordinates)) return null;

  const coordinates = inputCoordinates
    .map((point) => ({
      latitude: Number(point?.latitude),
      longitude: Number(point?.longitude),
    }))
    .filter(
      (point) =>
        Number.isFinite(point.latitude) &&
        Number.isFinite(point.longitude) &&
        Math.abs(point.latitude) <= 90 &&
        Math.abs(point.longitude) <= 180
    );

  if (coordinates.length < 2) return null;

  const cumulative = [0];

  for (let i = 1; i < coordinates.length; i += 1) {
    cumulative.push(
      cumulative[i - 1] +
        distanceMeters(coordinates[i - 1], coordinates[i])
    );
  }

  const totalM = cumulative[cumulative.length - 1];

  if (!Number.isFinite(totalM) || totalM <= 0) return null;

  return {
    coordinates,
    cumulative,
    totalM,
    durationS:
      Number(durationS) > 0 ? Number(durationS) : totalM / 0.8,
  };
}

function Stat({ label, value, divider }) {
  return (
    <View style={[styles.stat, divider && styles.statDivider]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const EMPTY_COLLECTION = { type: 'FeatureCollection', features: [] };

function toLngLat(point) {
  return [point.longitude, point.latitude];
}

function lineFeature(points) {
  if (!Array.isArray(points) || points.length < 2) return EMPTY_COLLECTION;

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: points.map(toLngLat),
    },
  };
}

function circleFeature(center, radiusM, steps = 48) {
  if (!center) return EMPTY_COLLECTION;

  const earthRadius = 6378137;
  const lat = (center.latitude * Math.PI) / 180;
  const ring = [];

  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * 2 * Math.PI;
    const dLat = (radiusM * Math.cos(angle)) / earthRadius;
    const dLon =
      (radiusM * Math.sin(angle)) / (earthRadius * Math.cos(lat));

    ring.push([
      center.longitude + (dLon * 180) / Math.PI,
      center.latitude + (dLat * 180) / Math.PI,
    ]);
  }

  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

// Same idea as the old latitudeDelta: smaller delta = higher zoom.
function deltaToZoom(delta) {
  return Math.max(2, Math.min(18, Math.log2(360 / delta)));
}

function fitCamera(camera, points, padding) {
  if (!camera || !points?.length) return;

  const lats = points.map((point) => point.latitude);
  const lons = points.map((point) => point.longitude);

  let west = Math.min(...lons);
  let east = Math.max(...lons);
  let south = Math.min(...lats);
  let north = Math.max(...lats);

  // Avoid zooming in absurdly far when points are almost identical.
  const MIN_SPAN = 0.004;

  if (east - west < MIN_SPAN) {
    const mid = (east + west) / 2;
    west = mid - MIN_SPAN / 2;
    east = mid + MIN_SPAN / 2;
  }

  if (north - south < MIN_SPAN) {
    const mid = (north + south) / 2;
    south = mid - MIN_SPAN / 2;
    north = mid + MIN_SPAN / 2;
  }

  camera.fitBounds([west, south, east, north], {
    padding,
    duration: 600,
  });
}

function UserMarker({ coordinate }) {
  return (
    <Marker lngLat={toLngLat(coordinate)} anchor="center">
      <View style={styles.currentLocationMarker}>
        <View style={styles.currentLocationDot} />
      </View>
    </Marker>
  );
}

export default function LiveTopoScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const mapRef = useRef(null);
  const locationSubscriptionRef = useRef(null);
  const abortRef = useRef(null);
  const retryTimerRef = useRef(null);
  const unmountedRef = useRef(false);
  const hasFixRef = useRef(false);
  const startingRef = useRef(false);
  const wantTrackingRef = useRef(false);
  const latestFixRef = useRef(null);
  const lastRecordedRef = useRef(null);
  const recStatusRef = useRef('idle');
  const recMetaRef = useRef(null);
  const recStatsRef = useRef({
    distanceM: 0,
    ascentM: 0,
    refAlt: null,
  });
  const accumulatedMsRef = useRef(0);
  const segmentStartRef = useRef(0);
  const savingRef = useRef(false);
  const progressRef = useRef(0);
  const requestIdRef = useRef(0);

  const trailId = Array.isArray(params.trailId)
    ? params.trailId[0]
    : params.trailId;

  const trailsResult = useTrails();
  const trails = Array.isArray(trailsResult)
    ? trailsResult
    : Array.isArray(trailsResult?.trails)
      ? trailsResult.trails
      : [];

  const trail = useMemo(
    () => trails.find((item) => String(item.id) === String(trailId)),
    [trails, trailId]
  );

  const destination = useMemo(() => {
    if (!trail) return null;

    const latitude = Number(trail.latitude);
    const longitude = Number(trail.longitude);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      return null;
    }

    return { latitude, longitude };
  }, [trail]);

  const [downloadedTrail, setDownloadedTrail] = useState(null);
  const [downloadingTrail, setDownloadingTrail] = useState(false);
  const [deletingTrail, setDeletingTrail] = useState(false);

  const [location, setLocation] = useState(null);
  const hasLocation = location !== null;
  const [accuracy, setAccuracy] = useState(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState('');
  const [isOnline, setIsOnline] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [panelVisible, setPanelVisible] = useState(true);

  const [guide, setGuide] = useState(null);
  const [guideLoading, setGuideLoading] = useState(false);

  const [recStatus, setRecStatus] = useState('idle');
  const [recPoints, setRecPoints] = useState([]);
  const [recStats, setRecStats] = useState({
    distanceM: 0,
    ascentM: null,
  });
  const [nowMs, setNowMs] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const panelPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dy) > 8 &&
        Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 35) setPanelVisible(false);
        if (gesture.dy < -35) setPanelVisible(true);
      },
    })
  ).current;

  useEffect(() => {
    let cancelled = false;

    async function loadDownloadedTrail() {
      if (!trailId) {
        setDownloadedTrail(null);
        return;
      }

      try {
        const stored = await AsyncStorage.getItem(OFFLINE_TRAILS_KEY);
        const savedTrails = stored ? JSON.parse(stored) : {};
        const key = String(trail?.id ?? trailId);

        if (!cancelled) {
          setDownloadedTrail(savedTrails[key] ?? null);
        }
      } catch (error) {
        console.warn('Unable to load offline route:', error.message);
        if (!cancelled) setDownloadedTrail(null);
      }
    }

    loadDownloadedTrail();

    return () => {
      cancelled = true;
    };
  }, [trailId, trail?.id]);

  useEffect(() => {
    let mounted = true;

    const updateNetworkStatus = (state) => {
      if (!mounted) return;

      setIsOnline(
        state.isConnected !== false &&
          state.isInternetReachable !== false
      );
    };

    Network.getNetworkStateAsync()
      .then(updateNetworkStatus)
      .catch(() => {
        if (mounted) setIsOnline(false);
      });

    const subscription =
      Network.addNetworkStateListener(updateNetworkStatus);

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const appendRecordedPoint = useCallback((fix) => {
    if (
      Number.isFinite(fix.accuracy) &&
      fix.accuracy > MAX_RECORD_ACCURACY_M
    ) {
      return;
    }

    const last = lastRecordedRef.current;
    let step = 0;

    if (last) {
      step = distanceMeters(last, fix);

      const minStep = Math.max(
        MIN_RECORD_STEP_M,
        Math.min(fix.accuracy ?? 0, 20) * 0.5
      );

      if (step < minStep) return;

      const seconds = (fix.timestamp - last.timestamp) / 1000;

      if (seconds > 0 && step / seconds > MAX_RECORD_SPEED_MPS) {
        return;
      }
    }

    lastRecordedRef.current = fix;

    const stats = recStatsRef.current;
    stats.distanceM += step;

    if (Number.isFinite(fix.altitude)) {
      if (stats.refAlt === null) {
        stats.refAlt = fix.altitude;
      } else {
        const diff = fix.altitude - stats.refAlt;

        if (Math.abs(diff) >= ALTITUDE_THRESHOLD_M) {
          if (diff > 0) stats.ascentM += diff;
          stats.refAlt = fix.altitude;
        }
      }
    }

    setRecPoints((previous) => [...previous, fix]);
    setRecStats({
      distanceM: stats.distanceM,
      ascentM: stats.refAlt === null ? null : stats.ascentM,
    });
  }, []);

  const handlePosition = useCallback(
    (position) => {
      if (unmountedRef.current) return;

      const coords = position?.coords ?? {};
      const { latitude, longitude, accuracy: fixAccuracy, altitude } =
        coords;

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return;
      }

      if (
        hasFixRef.current &&
        Number.isFinite(fixAccuracy) &&
        fixAccuracy > MAX_ACCEPTED_ACCURACY_M
      ) {
        return;
      }

      hasFixRef.current = true;

      const fix = {
        latitude,
        longitude,
        altitude: Number.isFinite(altitude) ? altitude : null,
        accuracy: Number.isFinite(fixAccuracy) ? fixAccuracy : null,
        timestamp: Number.isFinite(position?.timestamp)
          ? position.timestamp
          : Date.now(),
      };

      latestFixRef.current = fix;
      setLocation({ latitude, longitude });
      setAccuracy(fix.accuracy);
      setLocationLoading(false);

      if (recStatusRef.current === 'recording') {
        appendRecordedPoint(fix);
      }
    },
    [appendRecordedPoint]
  );

  const stopLocationTracking = useCallback(() => {
    wantTrackingRef.current = false;
    locationSubscriptionRef.current?.remove();
    locationSubscriptionRef.current = null;
  }, []);

  const startLocationTracking = useCallback(async () => {
    wantTrackingRef.current = true;

    if (locationSubscriptionRef.current || startingRef.current) return;

    startingRef.current = true;

    try {
      if (!hasFixRef.current) setLocationLoading(true);
      setLocationError('');

      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (!wantTrackingRef.current || unmountedRef.current) return;

      if (permission.status !== 'granted') {
        setLocationError(
          'Location permission is required to show your current position.'
        );
        setLocationLoading(false);
        return;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();

      if (!wantTrackingRef.current || unmountedRef.current) return;

      if (!servicesEnabled) {
        setLocationError(
          'Location services are turned off. Turn on GPS in your device settings.'
        );
        setLocationLoading(false);
        return;
      }

      if (!hasFixRef.current) {
        const lastKnown = await Location.getLastKnownPositionAsync({
          maxAge: 60000,
          requiredAccuracy: MAX_ACCEPTED_ACCURACY_M,
        }).catch(() => null);

        if (!wantTrackingRef.current || unmountedRef.current) return;
        if (lastKnown) handlePosition(lastKnown);
      }

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1500,
          distanceInterval: 2,
        },
        handlePosition
      );

      if (wantTrackingRef.current && !unmountedRef.current) {
        locationSubscriptionRef.current = subscription;
      } else {
        subscription.remove();
      }
    } catch (error) {
      if (!wantTrackingRef.current || unmountedRef.current) return;

      setLocationError(
        'Unable to get your location. Check your device location settings.'
      );
      setLocationLoading(false);
    } finally {
      startingRef.current = false;
    }
  }, [handlePosition]);

  useFocusEffect(
    useCallback(() => {
      startLocationTracking();

      return () => {
        if (recStatusRef.current !== 'recording') {
          stopLocationTracking();
        }
      };
    }, [startLocationTracking, stopLocationTracking])
  );

  useEffect(() => {
    unmountedRef.current = false;

    return () => {
      unmountedRef.current = true;
      stopLocationTracking();
      abortRef.current?.abort();
      clearTimeout(retryTimerRef.current);
    };
  }, [stopLocationTracking]);

  useEffect(() => {
    if (recStatus !== 'recording') return undefined;

    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()));

    return () => clearInterval(timer);
  }, [recStatus]);

  const resetRecording = useCallback(() => {
    recStatusRef.current = 'idle';
    recMetaRef.current = null;
    recStatsRef.current = {
      distanceM: 0,
      ascentM: 0,
      refAlt: null,
    };
    lastRecordedRef.current = null;
    accumulatedMsRef.current = 0;
    segmentStartRef.current = 0;
    savingRef.current = false;

    setRecStatus('idle');
    setRecPoints([]);
    setRecStats({ distanceM: 0, ascentM: null });
    setSaveError('');
    setSaving(false);
  }, []);

  const startRecording = useCallback(() => {
    const fix = latestFixRef.current;

    if (!fix || recStatusRef.current !== 'idle') return;

    const startedAt = Date.now();

    recMetaRef.current = {
      startedAt,
      endedAt: null,
      trailId: trailId ? String(trailId) : null,
      trailName: trail?.name || trail?.title || null,
    };

    accumulatedMsRef.current = 0;
    segmentStartRef.current = startedAt;
    lastRecordedRef.current = fix;
    recStatsRef.current = {
      distanceM: 0,
      ascentM: 0,
      refAlt: Number.isFinite(fix.altitude) ? fix.altitude : null,
    };

    recStatusRef.current = 'recording';
    setSaveError('');
    setRecPoints([fix]);
    setRecStats({
      distanceM: 0,
      ascentM: recStatsRef.current.refAlt === null ? null : 0,
    });
    setNowMs(startedAt);
    setRecStatus('recording');
  }, [trailId, trail]);

  const pauseRecording = useCallback(() => {
    if (recStatusRef.current !== 'recording') return;

    accumulatedMsRef.current +=
      Date.now() - segmentStartRef.current;

    recStatusRef.current = 'paused';
    setRecStatus('paused');
  }, []);

  const resumeRecording = useCallback(() => {
    if (recStatusRef.current !== 'paused') return;

    segmentStartRef.current = Date.now();
    lastRecordedRef.current = null;
    recStatusRef.current = 'recording';
    setNowMs(Date.now());
    setRecStatus('recording');
  }, []);

  const persistRecording = useCallback(
    async (status) => {
      const meta = recMetaRef.current;
      const currentStatus = recStatusRef.current;

      if (
        !meta ||
        currentStatus === 'idle' ||
        savingRef.current
      ) {
        return;
      }

      savingRef.current = true;
      setSaving(true);
      setSaveError('');

      const endedAt = meta.endedAt || Date.now();
      let durationMs = accumulatedMsRef.current;

      if (currentStatus === 'recording') {
        durationMs += Math.max(
          0,
          endedAt - segmentStartRef.current
        );
      }

      recMetaRef.current = { ...meta, endedAt };
      accumulatedMsRef.current = durationMs;
      recStatusRef.current = 'finished';
      setRecStatus('finished');

      try {
        await saveTrack({
          trailId: meta.trailId,
          trailName: meta.trailName,
          startedAt: new Date(meta.startedAt).toISOString(),
          endedAt: new Date(endedAt).toISOString(),
          durationS: Math.round(durationMs / 1000),
          distanceM: Math.round(recStatsRef.current.distanceM),
          ascentM:
            recStatsRef.current.refAlt === null
              ? null
              : Math.round(recStatsRef.current.ascentM),
          points: recPoints,
          status,
        });

        resetRecording();

        Alert.alert(
          status === 'completed' ? 'Track Saved' : 'Track Discarded',
          status === 'completed'
            ? 'Your hike has been saved to your Hiking History. It will sync when the server is reachable.'
            : 'Your discarded hike has been saved to your Hiking History. It will sync when the server is reachable.'
        );
      } catch (error) {
        setSaveError(
          'Could not save the track on this device. Please try again.'
        );
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [recPoints, resetRecording]
  );

  const stopRecording = useCallback(() => {
    const status = recStatusRef.current;

    if (status !== 'recording' && status !== 'paused') return;

    const endedAt = Date.now();

    if (status === 'recording') {
      accumulatedMsRef.current +=
        endedAt - segmentStartRef.current;
    }

    recMetaRef.current = {
      ...recMetaRef.current,
      endedAt,
    };

    recStatusRef.current = 'finished';
    setRecStatus('finished');

    if (recPoints.length < 2) {
      Alert.alert(
        'Track too short',
        'There is not much movement recorded yet. Keep recording or discard this hike.',
        [
          {
            text: 'Keep Recording',
            style: 'cancel',
            onPress: () => {
              if (status === 'recording') {
                segmentStartRef.current = Date.now();
              }

              recMetaRef.current = {
                ...recMetaRef.current,
                endedAt: null,
              };

              recStatusRef.current = status;
              setRecStatus(status);
            },
          },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => persistRecording('discarded'),
          },
        ]
      );
      return;
    }

    fitCamera(mapRef.current, recPoints, {
      top: 90,
      right: 55,
      bottom: 230,
      left: 55,
    });
  }, [recPoints, persistRecording]);

  const discardRecording = useCallback(() => {
    if (recStatusRef.current === 'idle' || savingRef.current) return;

    Alert.alert(
      'Discard this track?',
      'The hike will be marked as discarded and saved in your Hiking History.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => persistRecording('discarded'),
        },
      ]
    );
  }, [persistRecording]);

  const destKey = destination
    ? `${trailId}:${destination.latitude},${destination.longitude}`
    : null;

  const activeGuide =
    guide && guide.destKey === destKey ? guide : null;

  const canDownloadRoute =
    ['route', 'gpx'].includes(activeGuide?.source) &&
    Array.isArray(activeGuide?.coordinates) &&
    activeGuide.coordinates.length > 1;

  const downloadCurrentRoute = useCallback(async () => {
    if (
      !canDownloadRoute ||
      downloadingTrail ||
      !trail ||
      !destination ||
      !activeGuide
    ) {
      Alert.alert(
        'Route unavailable',
        'Wait until a solid blue route appears before downloading.'
      );
      return;
    }

    try {
      setDownloadingTrail(true);

      const key = String(trail.id ?? trailId);
      const coordinates = activeGuide.coordinates;
      const maxPoints = MAX_OFFLINE_ROUTE_POINTS;
      const step = Math.max(
        1,
        Math.ceil((coordinates.length - 1) / (maxPoints - 1))
      );

      const compactCoordinates = coordinates
        .filter(
          (point, index) =>
            index % step === 0 || index === coordinates.length - 1
        )
        .map((point) => ({
          latitude: Number(point.latitude.toFixed(5)),
          longitude: Number(point.longitude.toFixed(5)),
        }));

      if (compactCoordinates.length < 2) {
        throw new Error('The route does not contain enough points.');
      }

      const savedTrail = {
        id: key,
        name: String(trail.name ?? trail.title ?? 'Unnamed Trail'),
        latitude: Number(destination.latitude),
        longitude: Number(destination.longitude),
        region: trail.region ?? '',
        difficulty: trail.difficulty ?? '',
        distanceKm: trail.distanceKm ?? null,
        routeCoordinates: compactCoordinates,
        routeDurationS: Number(activeGuide.durationS) || 0,
        downloadedAt: new Date().toISOString(),
      };

      const stored = await AsyncStorage.getItem(OFFLINE_TRAILS_KEY);
      let savedTrails = {};

      if (stored) {
        try {
          savedTrails = JSON.parse(stored);
        } catch {
          savedTrails = {};
        }
      }

      if (
        !savedTrails ||
        typeof savedTrails !== 'object' ||
        Array.isArray(savedTrails)
      ) {
        savedTrails = {};
      }

      savedTrails[key] = savedTrail;

      await AsyncStorage.setItem(
        OFFLINE_TRAILS_KEY,
        JSON.stringify(savedTrails)
      );

      setDownloadedTrail(savedTrail);

      Alert.alert(
        'Trail downloaded',
        'The route and basic trail details are saved on this device. Map imagery is not downloaded.'
      );
    } catch (error) {
      console.error('PEAKLY route download failed:', error);

      Alert.alert(
        'Download failed',
        'Your device could not save the route. Free up device storage and try again.'
      );
    } finally {
      setDownloadingTrail(false);
    }
  }, [
    canDownloadRoute,
    downloadingTrail,
    trail,
    trailId,
    destination,
    activeGuide,
  ]);

  const deleteDownloadedTrail = useCallback(() => {
    if (!trailId || deletingTrail) return;

    Alert.alert(
      'Delete offline download?',
      'This removes the saved route from this device. It does not delete the trail from the server.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingTrail(true);

              const stored = await AsyncStorage.getItem(
                OFFLINE_TRAILS_KEY
              );

              const savedTrails = stored ? JSON.parse(stored) : {};
              const key = String(trail?.id ?? trailId);

              delete savedTrails[key];

              await AsyncStorage.setItem(
                OFFLINE_TRAILS_KEY,
                JSON.stringify(savedTrails)
              );

              setDownloadedTrail(null);

              Alert.alert(
                'Download deleted',
                'The saved offline route has been removed from this device.'
              );
            } catch (error) {
              console.warn('Unable to delete offline route:', error);

              Alert.alert(
                'Delete failed',
                'Could not remove the saved route. Please try again.'
              );
            } finally {
              setDeletingTrail(false);
            }
          },
        },
      ]
    );
  }, [trailId, trail, deletingTrail]);

  const arrived = useMemo(
    () =>
      Boolean(
        location &&
          destination &&
          distanceMeters(location, destination) <= ARRIVAL_METERS
      ),
    [location, destination]
  );

  const guideInfo = useMemo(() => {
    if (!location || !destination || !activeGuide) return null;

    if (activeGuide.source === 'straight') {
      return {
        line: [location, destination],
        remainingM: distanceMeters(location, destination),
        etaS: null,
        offRouteM: 0,
      };
    }

    const points = activeGuide.coordinates;
    const lastSegment = points.length - 2;

    if (lastSegment < 0) return null;

    let bestIndex = Math.min(progressRef.current, lastSegment);
    let bestDistance = Infinity;

    for (let i = bestIndex; i <= lastSegment; i += 1) {
      const distance = distanceToSegmentMeters(
        location,
        points[i],
        points[i + 1]
      );

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }

    progressRef.current = bestIndex;

    const next = points[bestIndex + 1];

    const remainingM =
      distanceMeters(location, next) +
      (activeGuide.totalM -
        activeGuide.cumulative[bestIndex + 1]);

    const etaS =
      activeGuide.durationS *
      Math.min(
        1,
        remainingM / Math.max(activeGuide.totalM, 1)
      );

    return {
      line: [location, ...points.slice(bestIndex + 1)],
      remainingM,
      etaS,
      offRouteM: bestDistance,
    };
  }, [location, destination, activeGuide]);

  useEffect(() => {
    if (!location || !destination || !destKey || arrived) return;

    const currentRequest = ++requestIdRef.current;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const timeout = setTimeout(
      () => controller.abort(),
      ROUTE_TIMEOUT_MS
    );

    setGuideLoading(true);

    async function loadRoute() {
      try {
        if (!isOnline) throw new Error('Offline');

        const route = await fetchFootRoute(
          location,
          destination,
          controller.signal
        );

        if (
          unmountedRef.current ||
          currentRequest !== requestIdRef.current
        ) {
          return;
        }

        progressRef.current = 0;

        setGuide({
          destKey,
          source: 'route',
          ...route,
        });
      } catch (error) {
        if (
          unmountedRef.current ||
          currentRequest !== requestIdRef.current
        ) {
          return;
        }

        const offlineRoute = buildRouteMetrics(
          downloadedTrail?.routeCoordinates ?? trail?.routeCoordinates,
          downloadedTrail?.routeDurationS ?? 0
        );

        if (offlineRoute) {
          progressRef.current = 0;

          setGuide({
            destKey,
            source: 'gpx',
            ...offlineRoute,
          });
        } else {
          setGuide({
            destKey,
            source: 'straight',
            coordinates: [],
            cumulative: [],
            totalM: 0,
            durationS: 0,
          });
        }
      } finally {
        clearTimeout(timeout);

        if (
          !unmountedRef.current &&
          currentRequest === requestIdRef.current
        ) {
          setGuideLoading(false);
        }
      }
    }

    loadRoute();

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [
    location?.latitude,
    location?.longitude,
    destination?.latitude,
    destination?.longitude,
    destKey,
    isOnline,
    downloadedTrail,
    trail,
    arrived,
  ]);

  const guideIsRoute = ['route', 'gpx'].includes(activeGuide?.source);
  const guideIsGpx = activeGuide?.source === 'gpx';
  const guideIsStraight = activeGuide?.source === 'straight';

  const centerOnCurrentLocation = useCallback(() => {
    if (!location || !mapRef.current) return;

    mapRef.current.flyTo({
      center: toLngLat(location),
      zoom: deltaToZoom(0.008),
      duration: 500,
    });
  }, [location]);

  const frameSelectedTrail = useCallback(() => {
    if (!mapRef.current) return;

    if (location && destination) {
      fitCamera(mapRef.current, [location, destination], {
        top: 90,
        right: 55,
        bottom: 200,
        left: 55,
      });
    } else if (destination) {
      mapRef.current.flyTo({
        center: toLngLat(destination),
        zoom: deltaToZoom(0.02),
        duration: 500,
      });
    } else if (location) {
      centerOnCurrentLocation();
    }
  }, [location, destination, centerOnCurrentLocation]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const currentLocation = latestFixRef.current;

    if (hasLocation && currentLocation && destination) {
      fitCamera(
        mapRef.current,
        guideInfo?.line?.length > 1
          ? guideInfo.line
          : [currentLocation, destination],
        {
          top: 90,
          right: 55,
          bottom: 210,
          left: 55,
        }
      );
    } else if (destination) {
      mapRef.current.flyTo({
        center: toLngLat(destination),
        zoom: deltaToZoom(0.02),
        duration: 500,
      });
    }
  }, [mapReady, trailId, hasLocation, destination, guideInfo?.line?.length]);

  // GeoJSON for the map layers (kept above the early returns below so the
  // hook order never changes).
  const guideLineData = useMemo(
    () => lineFeature(guideInfo?.line),
    [guideInfo?.line]
  );
  const recLineData = useMemo(() => lineFeature(recPoints), [recPoints]);
  const accuracyData = useMemo(
    () =>
      circleFeature(
        location,
        Math.min(Math.max(accuracy ?? 8, 5), 100)
      ),
    [location, accuracy]
  );

  if (!trailId) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <MaterialCommunityIcons
          name="map-marker-path"
          size={54}
          color={COLORS.primary}
        />
        <Text style={styles.emptyTitle}>No trail selected</Text>
        <Text style={styles.emptyDescription}>
          Open Maps and select a trail to view it here.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/maps')}
        >
          <Text style={styles.primaryButtonText}>Go to Maps</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!trail && trails.length === 0 && !downloadedTrail) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.emptyDescription}>
          Loading trail information…
        </Text>
      </SafeAreaView>
    );
  }

  if (!trail) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <MaterialCommunityIcons
          name="map-marker-question-outline"
          size={50}
          color={COLORS.muted}
        />
        <Text style={styles.emptyTitle}>Trail not found</Text>
        <Text style={styles.emptyDescription}>
          This trail is not in the current trail list. Open Maps while online
          to load the trail information.
        </Text>

        {downloadedTrail && (
          <TouchableOpacity
            style={styles.deleteDownloadButton}
            onPress={deleteDownloadedTrail}
            disabled={deletingTrail}
          >
            {deletingTrail ? (
              <ActivityIndicator color={COLORS.red} />
            ) : (
              <>
                <MaterialCommunityIcons
                  name="delete-outline"
                  size={20}
                  color={COLORS.red}
                />
                <Text style={styles.deleteDownloadButtonText}>
                  Delete Offline Download
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/maps')}
        >
          <Text style={styles.primaryButtonText}>Choose Another Trail</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const elapsedMs =
    recStatus === 'idle'
      ? 0
      : accumulatedMsRef.current +
        (recStatus === 'recording'
          ? Math.max(0, nowMs - segmentStartRef.current)
          : 0);

  const badge =
    recStatus === 'recording'
      ? { color: COLORS.red, label: `RECORDING · ${formatClock(elapsedMs)}` }
      : recStatus === 'paused'
        ? { color: COLORS.amber, label: `PAUSED · ${formatClock(elapsedMs)}` }
        : recStatus === 'finished'
          ? { color: COLORS.green, label: 'TRACK READY TO SAVE' }
          : { color: COLORS.primary, label: 'LIVE TOPO GUIDE' };

  const ascentLabel =
    recStats.ascentM === null
      ? '--'
      : `${Math.round(recStats.ascentM)} m`;

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'left', 'right']}
    >
      <View style={styles.mapContainer}>
        <MapLibreMap
          style={styles.map}
          mapStyle={OSM_STYLE}
          onDidFinishLoadingMap={() => setMapReady(true)}
          logo={false}
          attribution
        >
          <Camera
            ref={mapRef}
            initialViewState={{
              center: toLngLat(destination ?? DEFAULT_REGION),
              zoom: destination
                ? deltaToZoom(0.025)
                : deltaToZoom(DEFAULT_REGION.latitudeDelta),
            }}
          />

          {/*
            Sources and layers are ALWAYS rendered with fixed ids and only
            their data/opacity changes. MapLibre drops falsy children before
            rendering, so conditionally adding or removing a <Layer> shifts
            the remaining layers and crashes with "`id` cannot be changed".
          */}
          <GeoJSONSource
            id="guide-line"
            data={
              guideInfo && !arrived ? guideLineData : EMPTY_COLLECTION
            }
          >
            <Layer
              key="guide-line-casing"
              id="guide-line-casing"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': '#FFFFFF',
                'line-width': 9,
                'line-opacity': guideIsRoute ? 1 : 0,
              }}
            />
            <Layer
              key="guide-line-route"
              id="guide-line-route"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': COLORS.blue,
                'line-width': 5,
                'line-opacity': guideIsRoute ? 1 : 0,
              }}
            />
            <Layer
              key="guide-line-straight"
              id="guide-line-straight"
              type="line"
              paint={{
                'line-color': COLORS.blue,
                'line-width': 4,
                'line-dasharray': [3.5, 2.5],
                'line-opacity': guideIsRoute ? 0 : 1,
              }}
            />
          </GeoJSONSource>

          <GeoJSONSource id="rec-line" data={recLineData}>
            <Layer
              key="rec-line-casing"
              id="rec-line-casing"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#FFFFFF', 'line-width': 9 }}
            />
            <Layer
              key="rec-line-main"
              id="rec-line-main"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': COLORS.red, 'line-width': 5 }}
            />
          </GeoJSONSource>

          <GeoJSONSource id="accuracy-circle" data={accuracyData}>
            <Layer
              key="accuracy-fill"
              id="accuracy-fill"
              type="fill"
              paint={{
                'fill-color': '#22C55E',
                'fill-opacity': 0.18,
              }}
            />
            <Layer
              key="accuracy-outline"
              id="accuracy-outline"
              type="line"
              paint={{
                'line-color': '#22C55E',
                'line-opacity': 0.65,
                'line-width': 1,
              }}
            />
          </GeoJSONSource>

          {destination && (
            <Marker lngLat={toLngLat(destination)} anchor="bottom">
              <MaterialCommunityIcons
                name="map-marker"
                size={42}
                color="#FF8A00"
              />
            </Marker>
          )}

          {location && <UserMarker coordinate={location} />}
        </MapLibreMap>

        <View style={styles.mapButtons}>
          <TouchableOpacity
            style={styles.mapButton}
            onPress={centerOnCurrentLocation}
            accessibilityLabel="Center on my location"
          >
            <MaterialCommunityIcons
              name="crosshairs-gps"
              size={23}
              color={COLORS.primary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mapButton}
            onPress={frameSelectedTrail}
            accessibilityLabel="Show the selected trail route"
          >
            <MaterialCommunityIcons
              name="map-marker-path"
              size={23}
              color={COLORS.primary}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.trailBadge}>
          <View style={[styles.badgeDot, { backgroundColor: badge.color }]} />
          <View style={styles.trailBadgeTextContainer}>
            <Text style={styles.trailBadgeTitle} numberOfLines={1}>
              {trail.name || trail.title || 'Selected Trail'}
            </Text>
            <Text style={styles.trailBadgeSubtitle}>{badge.label}</Text>
            <Text style={styles.trailBadgeSubtitle}>
              {isOnline ? 'OPENSTREETMAP' : 'OFFLINE · MAP TILES MAY BE MISSING'}
            </Text>
          </View>
        </View>

        <View style={styles.legend}>
          <View style={styles.legendRow}>
            <View style={styles.legendBlueLine} />
            <Text style={styles.legendText}>Walking route</Text>
          </View>
          {recPoints.length > 0 && (
            <View style={styles.legendRow}>
              <View style={styles.legendRedLine} />
              <Text style={styles.legendText}>Recorded track</Text>
            </View>
          )}
          <View style={styles.legendRow}>
            <View style={styles.legendGreenDot} />
            <Text style={styles.legendText}>Your GPS location</Text>
          </View>
        </View>
      </View>

      {panelVisible ? (
        <View style={styles.bottomPanel}>
          <View
            style={styles.panelHandleTouchArea}
            {...panelPanResponder.panHandlers}
          >
            <View style={styles.panelHandle} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.panelContent}
          >
            <View style={styles.panelHeadingRow}>
              <View style={styles.panelIcon}>
                <MaterialCommunityIcons
                  name="terrain"
                  size={24}
                  color={COLORS.primary}
                />
              </View>

              <View style={styles.panelTitleContainer}>
                <Text style={styles.panelTitle}>Trail Guide</Text>
                <Text style={styles.panelSubtitle} numberOfLines={1}>
                  {trail.name || trail.title || 'Selected hiking trail'}
                </Text>
              </View>

              <View
                style={[
                  styles.statusPill,
                  location
                    ? styles.statusPillActive
                    : styles.statusPillInactive,
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: location
                        ? COLORS.green
                        : '#9CA3AF',
                    },
                  ]}
                />
                <Text style={styles.statusText}>
                  {location
                    ? accuracy != null
                      ? `GPS Active · ±${Math.round(accuracy)} m`
                      : 'GPS Active'
                    : 'GPS Waiting'}
                </Text>
              </View>
            </View>

            {locationLoading && (
              <View style={styles.messageRow}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.messageText}>
                  Getting your current location…
                </Text>
              </View>
            )}

            {!!locationError && (
              <View style={styles.warningBox}>
                <MaterialCommunityIcons
                  name="map-marker-alert-outline"
                  size={20}
                  color="#B45309"
                />
                <Text style={styles.warningText}>{locationError}</Text>
              </View>
            )}

            {arrived ? (
              <View style={[styles.guideCard, styles.guideCardArrived]}>
                <MaterialCommunityIcons
                  name="flag-checkered"
                  size={23}
                  color={COLORS.green}
                />
                <View style={styles.guideCardText}>
                  <Text style={styles.guideCardTitle}>You have arrived</Text>
                  <Text style={styles.guideCardSub}>
                    You are at the destination.
                  </Text>
                </View>
              </View>
            ) : guideInfo && guideIsRoute ? (
              <View style={styles.guideCard}>
                <MaterialCommunityIcons
                  name="navigation-variant-outline"
                  size={23}
                  color={COLORS.blue}
                />
                <View style={styles.guideCardText}>
                  <Text style={styles.guideCardTitle}>
                    {formatDistance(guideInfo.remainingM)} to go
                  </Text>
                  <Text style={styles.guideCardSub}>
                    {guideIsGpx
                      ? 'Offline saved route · follow with care'
                      : `About ${formatDuration(guideInfo.etaS)} on foot`}
                  </Text>
                </View>
              </View>
            ) : guideInfo && guideIsStraight ? (
              <View style={styles.warningBox}>
                <MaterialCommunityIcons
                  name="vector-line"
                  size={20}
                  color="#B45309"
                />
                <Text style={styles.warningText}>
                  Walking route unavailable. Showing a straight line,
                  {` ${formatDistance(guideInfo.remainingM)} away.`}
                </Text>
              </View>
            ) : location && guideLoading ? (
              <View style={styles.messageRow}>
                <ActivityIndicator size="small" color={COLORS.blue} />
                <Text style={styles.messageText}>
                  Finding the walking route…
                </Text>
              </View>
            ) : null}

            <View style={styles.downloadSection}>
              <TouchableOpacity
                style={[
                  styles.downloadButton,
                  !canDownloadRoute && styles.buttonDisabled,
                ]}
                onPress={downloadCurrentRoute}
                disabled={!canDownloadRoute || downloadingTrail}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Download route for offline use"
              >
                {downloadingTrail ? (
                  <ActivityIndicator color={COLORS.primary} />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name={
                        downloadedTrail
                          ? 'download-circle-outline'
                          : 'download'
                      }
                      size={21}
                      color={
                        canDownloadRoute ? COLORS.primary : '#9CA3AF'
                      }
                    />
                    <Text
                      style={[
                        styles.downloadButtonText,
                        !canDownloadRoute &&
                          styles.downloadButtonTextDisabled,
                      ]}
                    >
                      {downloadedTrail
                        ? 'Update Offline Route'
                        : 'Download Trail'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {!canDownloadRoute && (
                <Text style={styles.downloadHelperText}>
                  Download becomes available when a solid blue route appears.
                </Text>
              )}

              {downloadedTrail && (
                <TouchableOpacity
                  style={[
                    styles.deleteDownloadButton,
                    deletingTrail && styles.buttonDisabled,
                  ]}
                  onPress={deleteDownloadedTrail}
                  disabled={deletingTrail}
                  activeOpacity={0.85}
                >
                  {deletingTrail ? (
                    <ActivityIndicator color={COLORS.red} />
                  ) : (
                    <>
                      <MaterialCommunityIcons
                        name="delete-outline"
                        size={20}
                        color={COLORS.red}
                      />
                      <Text style={styles.deleteDownloadButtonText}>
                        Delete Download
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {recStatus === 'idle' && (
              <>
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    !location && styles.buttonDisabled,
                  ]}
                  onPress={startRecording}
                  disabled={!location}
                >
                  <MaterialCommunityIcons
                    name="record-circle-outline"
                    size={22}
                    color="#F87171"
                  />
                  <Text style={styles.primaryButtonText}>
                    Start Recording
                  </Text>
                </TouchableOpacity>
                <Text style={styles.helperText}>
                  {location
                    ? 'Record your hike, then save or discard it when you finish.'
                    : 'Waiting for GPS before you can record.'}
                </Text>
              </>
            )}

            {(recStatus === 'recording' || recStatus === 'paused') && (
              <>
                <View style={styles.statsRow}>
                  <Stat
                    label="Distance"
                    value={formatDistance(recStats.distanceM)}
                  />
                  <Stat
                    label="Time"
                    value={formatClock(elapsedMs)}
                    divider
                  />
                  <Stat
                    label="Ascent"
                    value={ascentLabel}
                    divider
                  />
                </View>

                <View style={styles.buttonRow}>
                  {recStatus === 'recording' ? (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.outlineButton]}
                      onPress={pauseRecording}
                    >
                      <MaterialCommunityIcons
                        name="pause"
                        size={21}
                        color={COLORS.text}
                      />
                      <Text style={styles.outlineButtonText}>Pause</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.greenButton]}
                      onPress={resumeRecording}
                    >
                      <MaterialCommunityIcons
                        name="play"
                        size={21}
                        color={COLORS.white}
                      />
                      <Text style={styles.primaryButtonText}>Resume</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.actionButton, styles.redButton]}
                    onPress={stopRecording}
                  >
                    <MaterialCommunityIcons
                      name="stop"
                      size={21}
                      color={COLORS.white}
                    />
                    <Text style={styles.primaryButtonText}>Stop</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {recStatus === 'finished' && (
              <>
                <View style={styles.summaryHeader}>
                  <MaterialCommunityIcons
                    name="flag-checkered"
                    size={18}
                    color={COLORS.green}
                  />
                  <Text style={styles.summaryTitle}>Recording finished</Text>
                  <Text style={styles.summarySub}>
                    {recPoints.length} GPS points
                  </Text>
                </View>

                <View style={styles.statsRow}>
                  <Stat
                    label="Distance"
                    value={formatDistance(recStats.distanceM)}
                  />
                  <Stat
                    label="Time"
                    value={formatClock(elapsedMs)}
                    divider
                  />
                  <Stat
                    label="Ascent"
                    value={ascentLabel}
                    divider
                  />
                </View>

                {!!saveError && (
                  <View style={styles.warningBox}>
                    <MaterialCommunityIcons
                      name="alert-circle-outline"
                      size={20}
                      color="#B45309"
                    />
                    <Text style={styles.warningText}>{saveError}</Text>
                  </View>
                )}

                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      styles.greenButton,
                      saving && styles.buttonDisabled,
                    ]}
                    onPress={() => persistRecording('completed')}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color={COLORS.white} />
                    ) : (
                      <>
                        <MaterialCommunityIcons
                          name="content-save-outline"
                          size={20}
                          color={COLORS.white}
                        />
                        <Text style={styles.primaryButtonText}>
                          Save Track
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      styles.discardButton,
                      saving && styles.buttonDisabled,
                    ]}
                    onPress={discardRecording}
                    disabled={saving}
                  >
                    <MaterialCommunityIcons
                      name="trash-can-outline"
                      size={20}
                      color={COLORS.red}
                    />
                    <Text style={styles.discardButtonText}>Discard</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {guideIsRoute && !guideIsGpx && (
              <Text style={styles.attribution}>
                Route data © OpenStreetMap contributors · Routing by OSRM
              </Text>
            )}

            {guideIsGpx && (
              <Text style={styles.attribution}>
                Offline saved route · verify the track before hiking
              </Text>
            )}
          </ScrollView>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.showPanelButton}
          onPress={() => setPanelVisible(true)}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons
            name="chevron-up"
            size={22}
            color={COLORS.primary}
          />
          <Text style={styles.showPanelButtonText}>Trail Guide</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#694F2E',
  },

  mapContainer: {
    flex: 1,
    minHeight: 280,
    overflow: 'hidden',
    backgroundColor: '#DCC6A9',
  },

  map: {
    ...StyleSheet.absoluteFillObject,
  },

  mapButtons: {
    position: 'absolute',
    right: 16,
    top: 18,
    gap: 10,
  },

  mapButton: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: '#C9AD8A',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
  },

  trailBadge: {
    position: 'absolute',
    top: 18,
    left: 16,
    right: 78,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#C9AD8A',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 4,
  },

  badgeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#694F2E',
    marginRight: 10,
  },

  trailBadgeTextContainer: {
    flex: 1,
  },

  trailBadgeTitle: {
    color: '#352719',
    fontSize: 14,
    fontWeight: '900',
  },

  trailBadgeSubtitle: {
    color: '#6E573F',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginTop: 4,
  },

  legend: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: '#C9AD8A',
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 11,
    gap: 9,
    elevation: 4,
  },

  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  legendBlueLine: {
    width: 22,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#236EF9',
  },

  legendRedLine: {
    width: 22,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C94B43',
  },

  legendGreenDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#58734B',
  },

  legendText: {
    fontSize: 11,
    color: '#352719',
    fontWeight: '700',
  },

  currentLocationMarker: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: 'rgba(88, 115, 75, 0.24)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(88, 115, 75, 0.75)',
  },

  currentLocationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#58734B',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  bottomPanel: {
    backgroundColor: '#694F2E',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    marginTop: -12,
  },

  panelHandleTouchArea: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 24,
    marginTop: -4,
    marginBottom: 5,
  },

  panelHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C9AD8A',
    marginBottom: 17,
  },

  showPanelButton: {
    position: 'absolute',
    bottom: 18,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#C9AD8A',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    elevation: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },

  showPanelButtonText: {
    color: '#352719',
    fontSize: 13,
    fontWeight: '900',
  },

  panelHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },

  panelIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: '#C9AD8A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  panelTitleContainer: {
    flex: 1,
  },

  panelTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  panelSubtitle: {
    fontSize: 12,
    color: '#E2D0B8',
    marginTop: 4,
  },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
  },

  statusPillActive: {
    backgroundColor: '#DCE8AE',
  },

  statusPillInactive: {
    backgroundColor: '#E8D8C3',
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  statusText: {
    fontSize: 10,
    color: '#352719',
    fontWeight: '800',
  },

  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 13,
  },

  messageText: {
    color: '#E2D0B8',
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },

  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F0DFC2',
    marginBottom: 13,
  },

  warningText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: '#69451D',
  },

  guideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#C9AD8A',
    borderRadius: 17,
    paddingVertical: 13,
    paddingHorizontal: 13,
    marginBottom: 13,
  },

  guideCardArrived: {
    backgroundColor: '#DCE8AE',
  },

  guideCardIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#E8D8C3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  guideCardIconArrived: {
    backgroundColor: '#F2F5DF',
  },

  guideCardText: {
    flex: 1,
  },

  guideCardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#352719',
  },

  guideCardSub: {
    fontSize: 12,
    color: '#6E573F',
    marginTop: 3,
    lineHeight: 17,
  },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#C9AD8A',
    borderRadius: 17,
    paddingVertical: 15,
    marginBottom: 14,
  },

  stat: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },

  statDivider: {
    borderLeftWidth: 1,
    borderLeftColor: '#B99A72',
  },

  statValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#352719',
  },

  statLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
    color: '#6E573F',
    marginTop: 5,
    textTransform: 'uppercase',
  },

  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },

  summaryTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  summarySub: {
    fontSize: 11,
    color: '#E2D0B8',
    fontWeight: '700',
  },

  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },

  actionButton: {
    flex: 1,
    minHeight: 49,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
  },

  greenButton: {
    backgroundColor: '#58734B',
  },

  redButton: {
    backgroundColor: '#A64035',
  },

  outlineButton: {
    backgroundColor: '#C9AD8A',
    borderWidth: 1.5,
    borderColor: '#B99A72',
  },

  outlineButtonText: {
    color: '#352719',
    fontSize: 14,
    fontWeight: '900',
  },

  discardButton: {
    backgroundColor: '#C9AD8A',
    borderWidth: 1.5,
    borderColor: '#D7A49B',
  },

  discardButtonText: {
    color: '#8E332B',
    fontSize: 14,
    fontWeight: '900',
  },

  buttonDisabled: {
    opacity: 0.5,
  },

  helperText: {
    fontSize: 11,
    lineHeight: 17,
    color: '#E2D0B8',
    textAlign: 'center',
    marginTop: 10,
  },

  attribution: {
    fontSize: 10,
    color: '#E2D0B8',
    textAlign: 'center',
    marginTop: 13,
  },

  primaryButton: {
    minHeight: 49,
    backgroundColor: '#C9AD8A',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 16,
  },

  primaryButtonText: {
    color: '#352719',
    fontSize: 14,
    fontWeight: '900',
  },

  emptyContainer: {
    flex: 1,
    backgroundColor: '#694F2E',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },

  emptyTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 16,
    textAlign: 'center',
  },

  emptyDescription: {
    fontSize: 14,
    lineHeight: 22,
    color: '#E2D0B8',
    textAlign: 'center',
    marginTop: 9,
    marginBottom: 22,
  },

  downloadSection: {
  marginTop: 10,
  marginBottom: 4,
  },

  downloadButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C9AD8A',
    backgroundColor: '#F7F0E6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 16,
  },
  downloadButtonText: {
    color: '#694F2E',
    fontSize: 14,
    fontWeight: '700',
  },
  downloadButtonTextDisabled: {
    color: '#9CA3AF',
  },
  downloadHelperText: {
    color: '#66736B',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 6,
  },
  deleteDownloadButton: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  deleteDownloadButtonText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
  },
});