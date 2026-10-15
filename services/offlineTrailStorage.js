
import AsyncStorage from '@react-native-async-storage/async-storage';

const TRAILS_CACHE_KEY = '@peakly_offline_trails_v1';
const TRACK_QUEUE_KEY = '@peakly_offline_track_queue_v1';

export async function saveOfflineTrails(trails) {
  if (!Array.isArray(trails)) {
    throw new Error('Trail data must be an array.');
  }

  await AsyncStorage.setItem(
    TRAILS_CACHE_KEY,
    JSON.stringify({
      savedAt: new Date().toISOString(),
      trails,
    })
  );

  return trails.length;
}

export async function getOfflineTrails() {
  const stored = await AsyncStorage.getItem(TRAILS_CACHE_KEY);

  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored);

    return Array.isArray(parsed.trails) ? parsed.trails : [];
  } catch {
    return [];
  }
}

export async function getOfflineTrailCacheInfo() {
  const stored = await AsyncStorage.getItem(TRAILS_CACHE_KEY);

  if (!stored) {
    return {
      available: false,
      count: 0,
      savedAt: null,
    };
  }

  try {
    const parsed = JSON.parse(stored);

    return {
      available: Array.isArray(parsed.trails),
      count: Array.isArray(parsed.trails)
        ? parsed.trails.length
        : 0,
      savedAt: parsed.savedAt ?? null,
    };
  } catch {
    return {
      available: false,
      count: 0,
      savedAt: null,
    };
  }
}

export async function savePendingTrack(track) {
  const stored = await AsyncStorage.getItem(TRACK_QUEUE_KEY);
  let queue = [];

  try {
    const parsed = stored ? JSON.parse(stored) : [];
    queue = Array.isArray(parsed) ? parsed : [];
  } catch {
    queue = [];
  }

  const trackId =
    track.id != null
      ? String(track.id)
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const pendingTrack = {
    ...track,
    id: trackId,
    syncStatus: 'pending',
    savedLocallyAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(
    TRACK_QUEUE_KEY,
    JSON.stringify([...queue, pendingTrack])
  );

  return pendingTrack;
}

export async function getPendingTracks() {
  const stored = await AsyncStorage.getItem(TRACK_QUEUE_KEY);

  try {
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function removePendingTrack(trackId) {
  const queue = await getPendingTracks();

  const updated = queue.filter(
    (track) => String(track.id) !== String(trackId)
  );

  await AsyncStorage.setItem(
    TRACK_QUEUE_KEY,
    JSON.stringify(updated)
  );

  return updated.length;
}
