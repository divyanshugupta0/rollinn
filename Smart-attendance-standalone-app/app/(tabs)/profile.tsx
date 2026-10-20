import { ScrollView, Text, View, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useState } from "react";
import * as Haptics from "expo-haptics";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, loading: authLoading } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await logout();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/auth/login");
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setLoggingOut(false);
    }
  };

  if (authLoading) {
    return (
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator size="large" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-6">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 gap-6">
          {/* Header */}
          <View className="items-center mb-4">
            <View className="w-20 h-20 rounded-full bg-primary items-center justify-center mb-4">
              <Text className="text-4xl font-bold text-white">
                {user?.email?.[0].toUpperCase() || "U"}
              </Text>
            </View>
            <Text className="text-2xl font-bold text-foreground">{user?.email || "User"}</Text>
            <Text className="text-sm text-muted mt-1">Student Account</Text>
          </View>

          {/* User Information Card */}
          <View className="bg-surface rounded-2xl p-6 border border-border">
            <Text className="text-lg font-semibold text-foreground mb-4">Account Information</Text>

            <View className="gap-4">
              <View>
                <Text className="text-xs font-medium text-muted mb-1">Email Address</Text>
                <Text className="text-base text-foreground">{user?.email || "Not available"}</Text>
              </View>

              <View>
                <Text className="text-xs font-medium text-muted mb-1">User ID</Text>
                <Text className="text-base text-foreground font-mono text-xs">
                  {user?.uid?.substring(0, 12)}...
                </Text>
              </View>

              <View>
                <Text className="text-xs font-medium text-muted mb-1">Account Status</Text>
                <View className="flex-row items-center gap-2">
                  <View className="w-2 h-2 rounded-full bg-success" />
                  <Text className="text-base text-foreground">Active</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Statistics Card */}
          <View className="bg-surface rounded-2xl p-6 border border-border">
            <Text className="text-lg font-semibold text-foreground mb-4">Attendance Statistics</Text>

            <View className="flex-row gap-4">
              <View className="flex-1 items-center py-4 bg-primary/10 rounded-lg">
                <Text className="text-2xl font-bold text-primary">0</Text>
                <Text className="text-xs text-muted mt-1">Classes Attended</Text>
              </View>

              <View className="flex-1 items-center py-4 bg-warning/10 rounded-lg">
                <Text className="text-2xl font-bold text-warning">0</Text>
                <Text className="text-xs text-muted mt-1">Total Classes</Text>
              </View>
            </View>
          </View>

          {/* Settings Section */}
          <View className="bg-surface rounded-2xl p-6 border border-border">
            <Text className="text-lg font-semibold text-foreground mb-4">Settings</Text>

            <Pressable
              className="py-3 border-b border-border"
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
            >
              <Text className="text-base text-foreground">Notifications</Text>
            </Pressable>

            <Pressable
              className="py-3 border-b border-border"
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
            >
              <Text className="text-base text-foreground">Privacy Settings</Text>
            </Pressable>

            <Pressable
              className="py-3"
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
            >
              <Text className="text-base text-foreground">Help & Support</Text>
            </Pressable>
          </View>

          {/* Logout Button */}
          <Pressable
            onPress={handleLogout}
            disabled={loggingOut}
            style={({ pressed }) => [
              {
                transform: [{ scale: pressed && !loggingOut ? 0.97 : 1 }],
                opacity: loggingOut ? 0.6 : 1,
              },
            ]}
          >
            <View className="bg-error rounded-lg py-3 items-center justify-center">
              {loggingOut ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text className="text-white font-semibold text-base">Sign Out</Text>
              )}
            </View>
          </Pressable>

          {/* Footer */}
          <View className="items-center py-4">
            <Text className="text-xs text-muted">Smart Attendance System v1.0</Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
