
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getOfflineTrails,
  saveOfflineTrails,
} from '../services/offlineTrailStorage';
import { getTrails } from '../services/trailService';

export function useTrails(bounds) {
  const [trails, setTrails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  const load = useCallback(async (area) => {
    if (
      area &&
      (
        !Number.isFinite(area.minLat) ||
        !Number.isFinite(area.maxLat) ||
        !Number.isFinite(area.minLon) ||
        !Number.isFinite(area.maxLon) ||
        area.minLat >= area.maxLat ||
        area.minLon >= area.maxLon
      )
    ) {
      return;
    }

    const currentRequest = ++requestId.current;

    setLoading(true);
    setError(null);

    try {
      // Load cached trails first so offline users have data immediately.
      const cachedTrails = await getOfflineTrails();

      if (currentRequest !== requestId.current) return;

      if (cachedTrails.length > 0) {
        const initialTrails = area
          ? cachedTrails.filter((trail) => {
              const lat = Number(trail.latitude ?? trail.lat);
              const lon = Number(
                trail.longitude ?? trail.lng ?? trail.lon
              );

              return (
                Number.isFinite(lat) &&
                Number.isFinite(lon) &&
                lat >= area.minLat &&
                lat <= area.maxLat &&
                lon >= area.minLon &&
                lon <= area.maxLon
              );
            })
          : cachedTrails;

        setTrails(initialTrails);
      }

      // Refresh the data from the API when internet is available.
      const result = await getTrails(area);

      if (currentRequest !== requestId.current) return;

      const freshTrails = Array.isArray(result) ? result : [];

      setTrails(freshTrails);

      // Only save full results to the main cache.
      // Never overwrite the full cache with a partial area query.
      if (!area && freshTrails.length > 0) {
        try {
          await saveOfflineTrails(freshTrails);
        } catch (cacheError) {
          console.warn(
            'Could not update offline trail cache:',
            cacheError
          );
        }
      }
    } catch (e) {
      if (currentRequest !== requestId.current) return;

      setError(e);

      // Keep cached trails if available. Only show an empty list
      // if neither the API nor local storage provided any trails.
      const cachedTrails = await getOfflineTrails().catch(() => []);

      if (currentRequest !== requestId.current) return;

      if (cachedTrails.length > 0) {
        const offlineTrails = area
          ? cachedTrails.filter((trail) => {
              const lat = Number(trail.latitude ?? trail.lat);
              const lon = Number(
                trail.longitude ?? trail.lng ?? trail.lon
              );

              return (
                Number.isFinite(lat) &&
                Number.isFinite(lon) &&
                lat >= area.minLat &&
                lat <= area.maxLat &&
                lon >= area.minLon &&
                lon <= area.maxLon
              );
            })
          : cachedTrails;

        setTrails(offlineTrails);
      } else {
        setTrails([]);
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    load(bounds);

    return () => {
      requestId.current += 1;
    };
  }, [bounds, load]);

  const refetch = useCallback(() => {
    return load(bounds);
  }, [bounds, load]);

  return {
    trails,
    loading,
    error,
    refetch,
  };
}
