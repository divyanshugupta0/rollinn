import React, { createContext, useContext, useState, useCallback } from "react";
import * as Location from "expo-location";

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

interface LocationContextType {
  currentLocation: LocationCoordinates | null;
  loading: boolean;
  error: string | null;
  requestLocationPermission: () => Promise<boolean>;
  getCurrentLocation: () => Promise<LocationCoordinates | null>;
  calculateDistance: (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ) => number;
  isWithinGeofence: (
    currentLat: number,
    currentLon: number,
    targetLat: number,
    targetLon: number,
    radiusMeters: number,
  ) => boolean;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

// Haversine formula to calculate distance between two coordinates
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [currentLocation, setCurrentLocation] = useState<LocationCoordinates | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestLocationPermission = useCallback(async (): Promise<boolean> => {
    try {
      setError(null);
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === "granted";
    } catch (err: any) {
      const errorMessage = err.message || "Failed to request location permission";
      setError(errorMessage);
      return false;
    }
  }, []);

  const getCurrentLocation = useCallback(async (): Promise<LocationCoordinates | null> => {
    try {
      setLoading(true);
      setError(null);

      // Request permission if not already granted
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") {
        const granted = await requestLocationPermission();
        if (!granted) {
          throw new Error("Location permission denied");
        }
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const coords: LocationCoordinates = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy || undefined,
      };

      setCurrentLocation(coords);
      return coords;
    } catch (err: any) {
      const errorMessage = err.message || "Failed to get current location";
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, [requestLocationPermission]);

  const calculateDistance = useCallback(
    (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      return haversineDistance(lat1, lon1, lat2, lon2);
    },
    [],
  );

  const isWithinGeofence = useCallback(
    (
      currentLat: number,
      currentLon: number,
      targetLat: number,
      targetLon: number,
      radiusMeters: number,
    ): boolean => {
      const distance = calculateDistance(currentLat, currentLon, targetLat, targetLon);
      return distance <= radiusMeters;
    },
    [calculateDistance],
  );

  return (
    <LocationContext.Provider
      value={{
        currentLocation,
        loading,
        error,
        requestLocationPermission,
        getCurrentLocation,
        calculateDistance,
        isWithinGeofence,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error("useLocation must be used within a LocationProvider");
  }
  return context;
}
