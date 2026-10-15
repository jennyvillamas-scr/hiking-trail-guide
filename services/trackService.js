
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

const API_URL = 'https://hiking-trail-guide-api.vercel.app/api';
const TRACKS_KEY = '@verdant_hiking_tracks';

let syncInProgress = false;
let networkListener = null;
let appStateListener = null;

async function readLocalTracks() {
  try {
    const stored = await AsyncStorage.getItem(TRACKS_KEY);
    if (!stored) return [];

    const tracks = JSON.parse(stored);
    return Array.isArray(tracks) ? tracks : [];
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
    try {
      const token = await SecureStore.getItemAsync(key);
      if (token) return token;
    } catch (error) {
      console.warn(`Could not read authentication token (${key}).`);
    }
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

function setupSyncListeners() {
  if (!networkListener) {
    networkListener = NetInfo.addEventListener((state) => {
      const online =
        state.isConnected === true &&
        state.isInternetReachable !== false;

      if (online) {
        syncTracks().catch((error) => {
          console.log('Automatic track sync failed:', error.message);
        });
      }
    });
  }

  if (!appStateListener) {
    appStateListener = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        syncTracks().catch((error) => {
          console.log('Track sync on app resume failed:', error.message);
        });
      }
    });
  }
}

setupSyncListeners();

export async function saveTrack(track) {
  const saved = {
    ...normalizeTrack(track),
    id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    savedAt: new Date().toISOString(),
    synced: false,
  };

  const tracks = await readLocalTracks();
  await writeLocalTracks([saved, ...tracks]);

  // The local save finishes before any network request.
  syncTracks().catch((error) => {
    console.log('Track saved locally; sync will retry:', error.message);
  });

  return saved;
}

export async function getTracks() {
  return readLocalTracks();
}

export async function getTrackById(id) {
  const tracks = await readLocalTracks();

  return (
    tracks.find((track) => String(track.id) === String(id)) ?? null
  );
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
            String(item.id) === String(track.id)
              ? {
                  ...item,
                  synced: true,
                  serverId: serverTrack?.id ?? null,
                }
              : item
          )
        );

        console.log(`Track ${track.id} synced successfully.`);
      } catch (error) {
        // Keep this track locally so a later attempt can retry it.
        console.log(
          `Track ${track.id} is still waiting to sync:`,
          error.message
        );
      }
    }
  } finally {
    syncInProgress = false;
  }
}
