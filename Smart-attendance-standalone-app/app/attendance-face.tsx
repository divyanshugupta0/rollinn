import { ScrollView, Text, View, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useLocation } from "@/lib/location-context";
import { useDatabase } from "@/lib/database-context";
import { useAuth } from "@/lib/auth-context";
import { useState, useEffect } from "react";
import * as Haptics from "expo-haptics";

export default function AttendanceFaceScreen() {
  const router = useRouter();
  const { classId, method } = useLocalSearchParams<{ classId: string; method: string }>();
  const { user } = useAuth();
  const { getCurrentLocation, calculateDistance, isWithinGeofence } = useLocation();
  const { getClassById, recordAttendance } = useDatabase();

  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [classLocation, setClassLocation] = useState<any>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [inRange, setInRange] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLocationData = async () => {
      try {
        setLoading(true);
        setError(null);

        const location = await getCurrentLocation();
        if (!location) {
          throw new Error("Could not access your location");
        }
        setCurrentLocation(location);

        if (classId) {
          const classInfo = await getClassById(classId);
          if (!classInfo) {
            throw new Error("Class not found");
          }
          setClassLocation(classInfo.location);

          const dist = calculateDistance(
            location.latitude,
            location.longitude,
            classInfo.location.latitude,
            classInfo.location.longitude,
          );
          setDistance(dist);

          const within = isWithinGeofence(
            location.latitude,
            location.longitude,
            classInfo.location.latitude,
            classInfo.location.longitude,
            100,
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

  const handleCaptureFace = () => {
    // Simulate face capture - in production, integrate with actual camera/face detection
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setFaceDetected(true);
  };

  const handleSubmit = async () => {
    try {
      if (!inRange) {
        setError("You must be within the class location to mark attendance");
        return;
      }

      if (!faceDetected) {
        setError("Please capture your face before submitting");
        return;
      }

      setSubmitting(true);
      setError(null);

      if (!user?.uid || !classId || !currentLocation) {
        throw new Error("Missing required information");
      }

      await recordAttendance({
        userId: user.uid,
        classId,
        timestamp: Date.now(),
        method: method || "location+face",
        location: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        },
        faceImage: "face_data_placeholder", // In production, upload actual face image
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
            <Text className="text-3xl font-bold text-foreground">Face Recognition</Text>
            <Text className="text-base text-muted mt-2">Verify your location and capture your face</Text>
          </View>

          {/* Error Message */}
          {error && (
            <View className="bg-error/10 border border-error rounded-lg p-4">
              <Text className="text-error text-sm font-medium">{error}</Text>
            </View>
          )}

          {/* Location Status Card */}
          {distance !== null && (
            <View className={`rounded-2xl p-6 border ${inRange ? "bg-success/10 border-success" : "bg-warning/10 border-warning"}`}>
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-sm font-medium text-muted">Location Status</Text>
                <View className={`rounded-full px-3 py-1 ${inRange ? "bg-success/20" : "bg-warning/20"}`}>
                  <Text className={`text-xs font-semibold ${inRange ? "text-success" : "text-warning"}`}>
                    {inRange ? "IN RANGE" : "OUT OF RANGE"}
                  </Text>
                </View>
              </View>
              <Text className={`text-2xl font-bold ${inRange ? "text-success" : "text-warning"}`}>
                {Math.round(distance)} m
              </Text>
            </View>
          )}

          {/* Face Capture Placeholder */}
          <View className="bg-surface rounded-2xl p-6 border border-border items-center justify-center h-48">
            {faceDetected ? (
              <View className="items-center">
                <View className="w-16 h-16 rounded-full bg-success/20 items-center justify-center mb-3">
                  <Text className="text-3xl">✓</Text>
                </View>
                <Text className="text-lg font-semibold text-foreground">Face Captured</Text>
                <Text className="text-xs text-muted mt-1">Ready to submit</Text>
              </View>
            ) : (
              <View className="items-center">
                <View className="w-16 h-16 rounded-full bg-primary/20 items-center justify-center mb-3">
                  <Text className="text-3xl">📷</Text>
                </View>
                <Text className="text-base font-semibold text-foreground">Camera Ready</Text>
                <Text className="text-xs text-muted mt-1">Tap below to capture</Text>
              </View>
            )}
          </View>

          {/* Capture Face Button */}
          <Pressable
            onPress={handleCaptureFace}
            disabled={submitting || !inRange}
            style={({ pressed }) => [
              {
                transform: [{ scale: pressed && !submitting && inRange ? 0.97 : 1 }],
                opacity: submitting || !inRange ? 0.5 : 1,
              },
            ]}
          >
            <View className="bg-primary rounded-lg py-3 items-center">
              <Text className="text-white font-semibold text-base">
                {faceDetected ? "Retake Photo" : "Capture Face"}
              </Text>
            </View>
          </Pressable>

          {/* Submit Button */}
          <Pressable
            onPress={handleSubmit}
            disabled={!inRange || !faceDetected || submitting}
            style={({ pressed }) => [
              {
                transform: [{ scale: pressed && !submitting && inRange && faceDetected ? 0.97 : 1 }],
                opacity: !inRange || !faceDetected || submitting ? 0.5 : 1,
              },
            ]}
          >
            <View className="bg-success rounded-lg py-4 items-center">
              {submitting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text className="text-white font-bold text-lg">Mark Attendance</Text>
              )}
            </View>
          </Pressable>

          {/* Info Section */}
          <View className="bg-surface rounded-2xl p-4 border border-border">
            <Text className="text-xs font-medium text-foreground mb-2">Face Recognition</Text>
            <Text className="text-xs text-muted leading-relaxed">
              Your face will be captured and verified against your registered profile for secure attendance marking.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
