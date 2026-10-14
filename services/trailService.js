
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MOCK_TRAILS } from '../constants/mockTrails';

const API_URL = 'https://hiking-trail-guide-api.vercel.app/api';
const CACHE_PREFIX = '@peakly_trails_area_';
const ALL_TRAILS_CACHE = '@peakly_trails_all';

function getCoordinate(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') {
      continue;
    }

    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
}

function normalizeTrail(trail) {
  if (!trail || typeof trail !== 'object') {
    return null;
  }

  const latitude = getCoordinate(
    trail.latitude,
    trail.lat,
    trail.coordinates?.latitude,
    trail.coordinates?.lat,
    trail.location?.latitude,
    trail.location?.lat
  );

  const longitude = getCoordinate(
    trail.longitude,
    trail.lng,
    trail.lon,
    trail.coordinates?.longitude,
    trail.coordinates?.lng,
    trail.coordinates?.lon,
    trail.location?.longitude,
    trail.location?.lng,
    trail.location?.lon
  );

  return {
    ...trail,
    id: trail.id ?? trail.trail_id,
    name: trail.name ?? trail.trail_name ?? 'Unnamed Trail',
    latitude,
    longitude,
    difficulty: trail.difficulty ?? 'Unknown',
  };
}

function hasValidCoordinates(trail) {
  return (
    trail &&
    Number.isFinite(trail.latitude) &&
    Number.isFinite(trail.longitude) &&
    trail.latitude >= -90 &&
    trail.latitude <= 90 &&
    trail.longitude >= -180 &&
    trail.longitude <= 180
  );
}

function isInsideBounds(trail, bounds) {
  if (!bounds) return true;

  return (
    hasValidCoordinates(trail) &&
    trail.latitude >= Number(bounds.minLat) &&
    trail.latitude <= Number(bounds.maxLat) &&
    trail.longitude >= Number(bounds.minLon) &&
    trail.longitude <= Number(bounds.maxLon)
  );
}

function makeBoundsKey(bounds) {
  return [
    bounds.minLat,
    bounds.maxLat,
    bounds.minLon,
    bounds.maxLon,
  ]
    .map((value) => Number(value).toFixed(3))
    .join('_');
}

async function readCache(key) {
  try {
    const cached = await AsyncStorage.getItem(key);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

async function writeCache(key, trails) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(trails));
  } catch (error) {
    console.warn('Unable to cache trails:', error.message);
  }
}

async function requestTrails(path) {
  const response = await fetch(`${API_URL}${path}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || `Trail request failed (${response.status}).`
    );
  }

  if (!Array.isArray(data.trails)) {
    throw new Error('The server did not return a trails array.');
  }

  return data.trails;
}

function filterTrails(trails, bounds) {
  return trails
    .map(normalizeTrail)
    .filter(hasValidCoordinates)
    .filter((trail) => isInsideBounds(trail, bounds));
}

function getMockTrails(bounds) {
  return filterTrails(MOCK_TRAILS, bounds);
}

export async function getTrails(bounds) {
  const cacheKey = bounds
    ? `${CACHE_PREFIX}${makeBoundsKey(bounds)}`
    : ALL_TRAILS_CACHE;

  try {
    const path = bounds
      ? `/trails/area?${new URLSearchParams({
          minLat: String(bounds.minLat),
          maxLat: String(bounds.maxLat),
          minLon: String(bounds.minLon),
          maxLon: String(bounds.maxLon),
        }).toString()}`
      : '/trails';

    const dataTrails = await requestTrails(path);
    const trails = filterTrails(dataTrails, bounds);

    console.log('Trails loaded from API:', {
      endpoint: path,
      received: dataTrails.length,
      validTrails: trails.length,
      bounds: bounds ?? 'All trails',
      sampleTrail: trails[0] ?? null,
    });

    await writeCache(cacheKey, trails);

    return trails;
  } catch (error) {
    console.warn('Unable to fetch trails from API:', error.message);

    const cached = await readCache(cacheKey);

    if (Array.isArray(cached)) {
      const validCached = filterTrails(cached, bounds);

      if (validCached.length > 0) {
        console.log('Using cached trails:', validCached.length);
        return validCached;
      }
    }

    const mockTrails = getMockTrails(bounds);

    console.log('Using mock trails:', mockTrails.length);

    return mockTrails;
  }
}

export async function getTrailById(id) {
  try {
    const data = await fetch(
      `${API_URL}/trails/${encodeURIComponent(String(id))}`
    ).then(async (response) => {
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || `Trail request failed (${response.status}).`
        );
      }

      return result;
    });

    if (data.trail) {
      return normalizeTrail(data.trail);
    }
  } catch (error) {
    console.warn('Unable to fetch trail details:', error.message);
  }

  const mockTrail = MOCK_TRAILS.find(
    (trail) => String(trail.id) === String(id)
  );

  return mockTrail ? normalizeTrail(mockTrail) : null;
}
