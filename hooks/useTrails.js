
import { useCallback, useEffect, useRef, useState } from 'react';
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

    try {
      setLoading(true);
      setError(null);

      // No bounds means fetch all trails.
      const result = await getTrails(area);

      if (currentRequest === requestId.current) {
        setTrails(Array.isArray(result) ? result : []);
      }
    } catch (e) {
      if (currentRequest === requestId.current) {
        setError(e);
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
