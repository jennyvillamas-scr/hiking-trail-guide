
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

const API_URL = 'https://hiking-trail-guide-api.vercel.app/api';

const FAVORITES_KEY = '@peakly_favorites';
const PENDING_KEY = '@peakly_favorites_pending';

let syncInProgress = false;
let appStateSubscription;

async function getToken() {
  return SecureStore.getItemAsync('authToken');
}

async function readJSON(key, fallback) {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJSON(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

async function readFavorites() {
  return readJSON(FAVORITES_KEY, []);
}

async function writeFavorites(favorites) {
  return writeJSON(FAVORITES_KEY, favorites);
}

async function readPending() {
  return readJSON(PENDING_KEY, []);
}

async function writePending(pending) {
  return writeJSON(PENDING_KEY, pending);
}

async function queueChange(trailId, action) {
  const id = String(trailId);
  const pending = await readPending();

  const updated = pending.filter(
    (item) => String(item.trailId) !== id
  );

  updated.push({ trailId: id, action });
  await writePending(updated);
}

async function request(path, method = 'GET') {
  const token = await getToken();

  if (!token) {
    throw new Error('Please sign in to sync favorites.');
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || 'Unable to sync favorites.'
    );
  }

  return data;
}

export async function getFavorites() {
  return readFavorites();
}

export async function isFavorite(trailId) {
  const favorites = await readFavorites();

  return favorites.some(
    (trail) => String(trail.id) === String(trailId)
  );
}

export async function addFavorite(trail) {
  if (!trail?.id) {
    throw new Error('A valid trail is required.');
  }

  const favorites = await readFavorites();
  const id = String(trail.id);

  if (
    favorites.some((item) => String(item.id) === id)
  ) {
    return favorites;
  }

  const updated = [...favorites, trail];

  await writeFavorites(updated);
  await queueChange(id, 'add');

  syncFavorites().catch((error) => {
    console.warn('Favorite sync postponed:', error.message);
  });

  return updated;
}

export async function removeFavorite(trailId) {
  const id = String(trailId);
  const favorites = await readFavorites();

  const updated = favorites.filter(
    (trail) => String(trail.id) !== id
  );

  await writeFavorites(updated);
  await queueChange(id, 'remove');

  syncFavorites().catch((error) => {
    console.warn('Favorite sync postponed:', error.message);
  });

  return updated;
}

export async function syncFavorites() {
  if (syncInProgress) {
    return { synced: false, count: 0 };
  }

  syncInProgress = true;

  try {
    const network = await Network.getNetworkStateAsync();

    if (!network.isConnected || network.isInternetReachable === false) {
      return { synced: false, count: 0 };
    }

    if (!(await getToken())) {
      return { synced: false, count: 0 };
    }

    let completed = 0;

    while (true) {
      const pending = await readPending();

      if (!pending.length) break;

      const item = pending[0];
      const path = `/favorites/${encodeURIComponent(
        String(item.trailId)
      )}`;

      try {
        await request(
          path,
          item.action === 'add' ? 'POST' : 'DELETE'
        );

        const current = await readPending();

        await writePending(
          current.filter(
            (entry) =>
              !(
                String(entry.trailId) ===
                  String(item.trailId) &&
                entry.action === item.action
              )
          )
        );

        completed += 1;
      } catch (error) {
        console.warn('Favorite sync postponed:', error.message);
        break;
      }
    }

    return {
      synced: (await readPending()).length === 0,
      count: completed,
    };
  } finally {
    syncInProgress = false;
  }
}

export async function refreshFavoritesFromServer() {
  const data = await request('/favorites');

  if (!Array.isArray(data.favorites)) {
    throw new Error('Invalid favorites response from server.');
  }

  const pending = await readPending();
  const localFavorites = await readFavorites();

  const merged = new Map(
    data.favorites.map((trail) => [String(trail.id), trail])
  );

  for (const item of pending) {
    const id = String(item.trailId);

    if (item.action === 'remove') {
      merged.delete(id);
    } else {
      const localTrail = localFavorites.find(
        (trail) => String(trail.id) === id
      );

      if (localTrail) merged.set(id, localTrail);
    }
  }

  const favorites = [...merged.values()];

  await writeFavorites(favorites);

  return favorites;
}

export function startFavoriteSync() {
  if (appStateSubscription) return;

  syncFavorites().catch(() => {});

  appStateSubscription = AppState.addEventListener(
    'change',
    (state) => {
      if (state === 'active') {
        syncFavorites().catch(() => {});
      }
    }
  );
}

export function stopFavoriteSync() {
  appStateSubscription?.remove();
  appStateSubscription = undefined;
}
