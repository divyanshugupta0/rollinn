import { ScrollView, Text, View, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useDatabase, ClassInfo } from "@/lib/database-context";
import { useState, useEffect } from "react";
import * as Haptics from "expo-haptics";

export default function ClassDetailsScreen() {
  const router = useRouter();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const { getClassById } = useDatabase();
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchClass = async () => {
      try {
        setLoading(true);
        setError(null);
        if (classId) {
          const fetchedClass = await getClassById(classId);
          if (fetchedClass) {
            setClassInfo(fetchedClass);
          } else {
            setError("Class not found");
          }
        }
      } catch (err: any) {
        setError(err.message || "Failed to load class details");
      } finally {
        setLoading(false);
      }
    };

    fetchClass();
  }, [classId, getClassById]);

  const handleMarkAttendance = () => {
    if (!classInfo) return;
    Haptics.impactAsync("light" as any);
    
    let pathname = "/attendance-location";
    if (classInfo.attendanceMethod.type === "location+face") {
      pathname = "/attendance-face";
    } else if (classInfo.attendanceMethod.type === "location+qr") {
      pathname = "/attendance-qr";
    } else if (classInfo.attendanceMethod.type === "location+code") {
      pathname = "/attendance-code";
    }
    
    router.push({
      pathname: pathname as any,
      params: { 
        method: classInfo.attendanceMethod.type,
        classId: classInfo.id,
      },
    });
  };

  if (loading) {
    return (
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator size="large" />
      </ScreenContainer>
    );
  }

  if (error || !classInfo) {
    return (
      <ScreenContainer className="p-6">
        <View className="flex-1 items-center justify-center">
          <View className="bg-error/10 border border-error rounded-lg p-6 items-center">
            <Text className="text-error font-semibold text-lg mb-2">Error</Text>
            <Text className="text-error text-center">{error || "Class not found"}</Text>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
              className="mt-4"
            >
              <Text className="text-primary font-semibold">Go Back</Text>
            </Pressable>
          </View>
        </View>
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

          {/* Class Title */}
          <View>
            <Text className="text-3xl font-bold text-foreground">{classInfo.name}</Text>
            <Text className="text-base text-muted mt-2">{classInfo.instructorName}</Text>
          </View>

          {/* Class Information Card */}
          <View className="bg-surface rounded-2xl p-6 border border-border gap-4">
            <View>
              <Text className="text-xs font-medium text-muted mb-1">Class Code</Text>
              <Text className="text-lg font-semibold text-foreground font-mono">{classInfo.code}</Text>
            </View>

            <View>
              <Text className="text-xs font-medium text-muted mb-1">Time</Text>
              <Text className="text-lg font-semibold text-foreground">
                {classInfo.startTime} - {classInfo.endTime}
              </Text>
            </View>

            <View>
              <Text className="text-xs font-medium text-muted mb-1">Location</Text>
              <Text className="text-lg font-semibold text-foreground">{classInfo.location.name}</Text>
              <Text className="text-sm text-muted mt-1">
                Coordinates: {classInfo.location.latitude.toFixed(4)}, {classInfo.location.longitude.toFixed(4)}
              </Text>
            </View>

            <View>
              <Text className="text-xs font-medium text-muted mb-1">Instructor</Text>
              <Text className="text-lg font-semibold text-foreground">{classInfo.instructorName}</Text>
            </View>
          </View>

          {/* Attendance Method Card */}
          <View className="bg-primary/10 rounded-2xl p-6 border border-primary/20">
            <Text className="text-xs font-medium text-primary mb-2">Attendance Method</Text>
            <Text className="text-2xl font-bold text-primary mb-2">
              {classInfo.attendanceMethod.type.toUpperCase()}
            </Text>

            <View className="mt-4 gap-2">
              {classInfo.attendanceMethod.type === "location" && (
                <Text className="text-sm text-primary">
                  Verify your location to mark attendance
                </Text>
              )}
              {classInfo.attendanceMethod.type === "location+face" && (
                <Text className="text-sm text-primary">
                  Verify your location and capture your face
                </Text>
              )}
              {classInfo.attendanceMethod.type === "location+qr" && (
                <Text className="text-sm text-primary">
                  Verify your location and scan the QR code
                </Text>
              )}
              {classInfo.attendanceMethod.type === "location+code" && (
                <Text className="text-sm text-primary">
                  Verify your location and enter the attendance code
                </Text>
              )}
            </View>
          </View>

          {/* Mark Attendance Button */}
          <Pressable
            onPress={handleMarkAttendance}
            style={({ pressed }) => [
              { transform: [{ scale: pressed ? 0.97 : 1 }] },
            ]}
          >
            <View className="bg-primary rounded-lg py-4 items-center">
              <Text className="text-white font-bold text-lg">Mark Attendance</Text>
            </View>
          </Pressable>

          {/* Info Section */}
          <View className="bg-warning/10 rounded-2xl p-4 border border-warning/20">
            <Text className="text-xs font-medium text-warning mb-2">Important</Text>
            <Text className="text-xs text-warning leading-relaxed">
              Make sure you are at the class location before marking attendance. Your location will be verified during the process.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
