import { ScrollView, Text, View, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useLocation } from "@/lib/location-context";
import { useDatabase } from "@/lib/database-context";
import { useAuth } from "@/lib/auth-context";
import { useState, useEffect } from "react";
import * as Haptics from "expo-haptics";

export default function AttendanceLocationScreen() {
  const router = useRouter();
  const { classId, method } = useLocalSearchParams<{ classId: string; method: string }>();
  const { user } = useAuth();
  const { getCurrentLocation, calculateDistance, isWithinGeofence } = useLocation();
  const { getClassById, recordAttendance } = useDatabase();
  
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [classLocation, setClassLocation] = useState<any>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [inRange, setInRange] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLocationData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get current location
        const location = await getCurrentLocation();
        if (!location) {
          throw new Error("Could not access your location");
        }
        setCurrentLocation(location);

        // Get class location
        if (classId) {
          const classInfo = await getClassById(classId);
          if (!classInfo) {
            throw new Error("Class not found");
          }
          setClassLocation(classInfo.location);

          // Calculate distance
          const dist = calculateDistance(
            location.latitude,
            location.longitude,
            classInfo.location.latitude,
            classInfo.location.longitude,
          );
          setDistance(dist);

          // Check if within geofence (default 100 meters)
          const within = isWithinGeofence(
            location.latitude,
            location.longitude,
            classInfo.location.latitude,
            classInfo.location.longitude,
            100, // 100 meters radius
          );
          setInRange(within);
        }
      } catch (err: any) {
        setError(err.message || "Failed to get location");
      } finally {
        setLoading(false);
      }
    };

    fetchLocationData();
  }, [classId, getCurrentLocation, getClassById, calculateDistance, isWithinGeofence]);

  const handleSubmit = async () => {
    try {
      if (!inRange) {
        setError("You must be within the class location to mark attendance");
        return;
      }

      setSubmitting(true);
      setError(null);

      if (!user?.uid || !classId || !currentLocation) {
        throw new Error("Missing required information");
      }

      // Record attendance
      await recordAttendance({
        userId: user.uid,
        classId,
        timestamp: Date.now(),
        method: method || "location",
        location: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        },
        status: "present",
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({
        pathname: "/attendance-success",
        params: { classId },
      });
    } catch (err: any) {
      setError(err.message || "Failed to record attendance");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="text-muted mt-4">Getting your location...</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-6">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 gap-6">
          {/* Header */}
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <Text className="text-primary font-semibold mb-4">← Back</Text>
          </Pressable>

          <View>
            <Text className="text-3xl font-bold text-foreground">Location Verification</Text>
            <Text className="text-base text-muted mt-2">Verify your location to mark attendance</Text>
          </View>

          {/* Error Message */}
          {error && (
            <View className="bg-error/10 border border-error rounded-lg p-4">
              <Text className="text-error text-sm font-medium">{error}</Text>
            </View>
          )}

          {/* Current Location Card */}
          {currentLocation && (
            <View className="bg-surface rounded-2xl p-6 border border-border">
              <Text className="text-sm font-medium text-muted mb-3">Your Location</Text>
              <Text className="text-lg font-semibold text-foreground">
                {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}
              </Text>
              {currentLocation.accuracy && (
                <Text className="text-xs text-muted mt-2">
                  Accuracy: ±{Math.round(currentLocation.accuracy)} meters
                </Text>
              )}
            </View>
          )}

          {/* Class Location Card */}
          {classLocation && (
            <View className="bg-surface rounded-2xl p-6 border border-border">
              <Text className="text-sm font-medium text-muted mb-3">Class Location</Text>
              <Text className="text-lg font-semibold text-foreground">{classLocation.name}</Text>
              <Text className="text-xs text-muted mt-2">
                {classLocation.latitude.toFixed(6)}, {classLocation.longitude.toFixed(6)}
              </Text>
            </View>
          )}

          {/* Distance and Status Card */}
          {distance !== null && (
            <View className={`rounded-2xl p-6 border ${inRange ? "bg-success/10 border-success" : "bg-warning/10 border-warning"}`}>
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-sm font-medium text-muted">Distance to Class</Text>
                <View className={`rounded-full px-3 py-1 ${inRange ? "bg-success/20" : "bg-warning/20"}`}>
                  <Text className={`text-xs font-semibold ${inRange ? "text-success" : "text-warning"}`}>
                    {inRange ? "IN RANGE" : "OUT OF RANGE"}
                  </Text>
                </View>
              </View>
              <Text className={`text-3xl font-bold ${inRange ? "text-success" : "text-warning"}`}>
                {Math.round(distance)} m
              </Text>
              <Text className="text-xs text-muted mt-2">
                {inRange ? "You are within the class location" : "You are outside the class location"}
              </Text>
            </View>
          )}

          {/* Submit Button */}
          <Pressable
            onPress={handleSubmit}
            disabled={!inRange || submitting}
            style={({ pressed }) => [
              {
                transform: [{ scale: pressed && !submitting && inRange ? 0.97 : 1 }],
                opacity: !inRange || submitting ? 0.5 : 1,
              },
            ]}
          >
            <View className="bg-primary rounded-lg py-4 items-center">
              {submitting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text className="text-white font-bold text-lg">
                  {inRange ? "Mark Attendance" : "Out of Range"}
                </Text>
              )}
            </View>
          </Pressable>

          {/* Info Section */}
          <View className="bg-surface rounded-2xl p-4 border border-border">
            <Text className="text-xs font-medium text-foreground mb-2">Location Method</Text>
            <Text className="text-xs text-muted leading-relaxed">
              Your location is verified using GPS coordinates. Make sure you are physically present at the class location.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
