import { ScrollView, Text, View, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useDatabase } from "@/lib/database-context";
import { useState, useEffect } from "react";

export default function AttendanceSuccessScreen() {
  const router = useRouter();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const { getClassById } = useDatabase();
  const [className, setClassName] = useState<string>("");

  useEffect(() => {
    const fetchClass = async () => {
      if (classId) {
        const classInfo = await getClassById(classId);
        if (classInfo) {
          setClassName(classInfo.name);
        }
      }
    };
    fetchClass();
  }, [classId, getClassById]);

  const handleBackToDashboard = () => {
    router.replace("/(tabs)");
  };

  const currentTime = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <ScreenContainer containerClassName="bg-success/5" edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 items-center justify-center px-6 py-8">
          {/* Success Icon */}
          <View className="w-24 h-24 rounded-full bg-success/20 items-center justify-center mb-6">
            <Text className="text-5xl">✓</Text>
          </View>

          {/* Success Message */}
          <Text className="text-3xl font-bold text-foreground text-center mb-2">
            Attendance Marked!
          </Text>
          <Text className="text-base text-muted text-center mb-8">
            Your attendance has been successfully recorded
          </Text>

          {/* Details Card */}
          <View className="w-full bg-surface rounded-2xl p-6 border border-border mb-8">
            <View className="gap-4">
              <View>
                <Text className="text-xs font-medium text-muted mb-1">Class</Text>
                <Text className="text-lg font-semibold text-foreground">{className || "Class"}</Text>
              </View>

              <View>
                <Text className="text-xs font-medium text-muted mb-1">Time Marked</Text>
                <Text className="text-lg font-semibold text-foreground">{currentTime}</Text>
              </View>

              <View>
                <Text className="text-xs font-medium text-muted mb-1">Status</Text>
                <View className="flex-row items-center gap-2">
                  <View className="w-3 h-3 rounded-full bg-success" />
                  <Text className="text-lg font-semibold text-success">Present</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Info Section */}
          <View className="w-full bg-primary/10 rounded-2xl p-4 border border-primary/20 mb-8">
            <Text className="text-xs font-medium text-primary mb-2">Confirmation</Text>
            <Text className="text-xs text-primary leading-relaxed">
              Your attendance record has been saved to the system and is now visible to your instructor.
            </Text>
          </View>

          {/* Back Button */}
          <Pressable
            onPress={handleBackToDashboard}
            style={({ pressed }) => [
              { transform: [{ scale: pressed ? 0.97 : 1 }] },
            ]}
            className="w-full"
          >
            <View className="bg-primary rounded-lg py-4 items-center">
              <Text className="text-white font-bold text-lg">Back to Dashboard</Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
