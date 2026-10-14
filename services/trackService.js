
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const API_URL = 'https://hiking-trail-guide-api.vercel.app/api';
const TRACKS_KEY = '@verdant_hiking_tracks';

let syncInProgress = false;

async function readLocalTracks() {
  try {
    const stored = await AsyncStorage.getItem(TRACKS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Could not read local hiking tracks:', error);
    return [];
  }
}

async function writeLocalTracks(tracks) {
  await AsyncStorage.setItem(TRACKS_KEY, JSON.stringify(tracks));
}

async function getAuthToken() {
  const keys = ['authToken', 'token', 'userToken'];

  for (const key of keys) {
    const token = await SecureStore.getItemAsync(key);
    if (token) return token;
  }

  return null;
}

async function requestApi(path, options = {}) {
  const token = await getAuthToken();

  if (!token) {
    throw new Error('Please sign in to sync your hiking tracks.');
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    throw new Error(result.message || 'Unable to sync hiking tracks.');
  }

  return result;
}

function normalizeTrack(track) {
  return {
    ...track,
    status: track.status === 'discarded' ? 'discarded' : 'completed',
  };
}

function toApiTrack(track) {
  return {
    trailId: track.trailId ?? null,
    trailName: track.trailName ?? null,
    startedAt: track.startedAt,
    endedAt: track.endedAt,
    durationS: Number(track.durationS || 0),
    distanceM: Number(track.distanceM || 0),
    ascentM: track.ascentM ?? null,
    points: Array.isArray(track.points) ? track.points : [],
    status: track.status === 'discarded' ? 'discarded' : 'completed',
  };
}

export async function saveTrack(track) {
  const saved = {
    ...normalizeTrack(track),
    id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    savedAt: new Date().toISOString(),
    synced: false,
  };

  const tracks = await readLocalTracks();
  await writeLocalTracks([saved, ...tracks]);

  // Saving locally succeeds even if this attempt to sync fails.
  syncTracks().catch((error) => {
    console.log('Track saved offline; sync will be retried later:', error.message);
  });

  return saved;
}

export async function getTracks() {
  return readLocalTracks();
}

export async function getTrackById(id) {
  const tracks = await readLocalTracks();
  return tracks.find((track) => String(track.id) === String(id)) ?? null;
}

export async function deleteTrack(id) {
  const tracks = await readLocalTracks();
  await writeLocalTracks(
    tracks.filter((track) => String(track.id) !== String(id))
  );
}

export async function syncTracks() {
  if (syncInProgress) return;

  syncInProgress = true;

  try {
    const tracks = await readLocalTracks();
    const pending = tracks.filter((track) => !track.synced);

    if (pending.length === 0) return;

    for (const track of pending) {
      try {
        const result = await requestApi('/tracks', {
          method: 'POST',
          body: JSON.stringify(toApiTrack(track)),
        });

        const serverTrack = result.track ?? result.data ?? null;
        const latestTracks = await readLocalTracks();

        await writeLocalTracks(
          latestTracks.map((item) =>
            item.id === track.id
              ? {
                  ...item,
                  synced: true,
                  serverId: serverTrack?.id ?? null,
                }
              : item
          )
        );
      } catch (error) {
        // Keep unsynced tracks locally for the next attempt.
        console.log(`Track ${track.id} is still waiting to sync:`, error.message);
      }
    }
  } finally {
    syncInProgress = false;
  }
}
