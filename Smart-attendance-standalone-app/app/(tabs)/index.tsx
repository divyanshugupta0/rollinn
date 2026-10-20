import { ScrollView, Text, View, Pressable, ActivityIndicator, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useDatabase, ClassInfo } from "@/lib/database-context";
import { useAuth } from "@/lib/auth-context";
import { useState, useEffect } from "react";
import * as Haptics from "expo-haptics";

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { getClasses } = useDatabase();
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        setLoading(true);
        setError(null);
        if (user?.uid) {
          const fetchedClasses = await getClasses(user.uid);
          setClasses(fetchedClasses);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load classes");
      } finally {
        setLoading(false);
      }
    };

    fetchClasses();
  }, [user?.uid, getClasses]);

  const handleClassPress = (classId: string) => {
    Haptics.impactAsync("light" as any);
    router.push({
      pathname: "/class-details",
      params: { classId: classId },
    });
  };

  const renderClassCard = ({ item }: { item: ClassInfo }) => (
    <Pressable
      onPress={() => handleClassPress(item.id)}
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
    >
      <View className="bg-surface rounded-2xl p-4 mb-4 border border-border">
        <View className="flex-row justify-between items-start mb-3">
          <View className="flex-1">
            <Text className="text-lg font-bold text-foreground">{item.name}</Text>
            <Text className="text-sm text-muted mt-1">
              {item.instructorName}
            </Text>
          </View>
          <View className="bg-primary/10 rounded-full px-3 py-1">
            <Text className="text-xs font-semibold text-primary">{item.attendanceMethod.type}</Text>
          </View>
        </View>

        <View className="gap-2">
          <View className="flex-row items-center gap-2">
            <Text className="text-xs text-muted">Time:</Text>
            <Text className="text-sm text-foreground font-medium">
              {item.startTime} - {item.endTime}
            </Text>
          </View>

          <View className="flex-row items-center gap-2">
            <Text className="text-xs text-muted">Location:</Text>
            <Text className="text-sm text-foreground font-medium">{item.location.name}</Text>
          </View>

          <View className="flex-row items-center gap-2">
            <Text className="text-xs text-muted">Class Code:</Text>
            <Text className="text-sm text-foreground font-mono">{item.code}</Text>
          </View>
        </View>

        <Pressable
          onPress={() => handleClassPress(item.id)}
          style={({ pressed }) => [
            { transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
        >
          <View className="bg-primary rounded-lg py-2 mt-4 items-center">
            <Text className="text-white font-semibold text-sm">Mark Attendance</Text>
          </View>
        </Pressable>
      </View>
    </Pressable>
  );

  return (
    <ScreenContainer className="p-4">
      <View className="flex-1">
        {/* Header */}
        <View className="mb-6">
          <Text className="text-3xl font-bold text-foreground">Dashboard</Text>
          <Text className="text-sm text-muted mt-1">
            Welcome, {user?.email?.split("@")[0]}
          </Text>
        </View>

        {/* Error State */}
        {error && (
          <View className="bg-error/10 border border-error rounded-lg p-4 mb-4">
            <Text className="text-error text-sm font-medium">{error}</Text>
          </View>
        )}

        {/* Loading State */}
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" />
            <Text className="text-muted mt-4">Loading classes...</Text>
          </View>
        ) : classes.length === 0 ? (
          <View className="flex-1 items-center justify-center py-12">
            <View className="bg-surface rounded-2xl p-8 items-center border border-border">
              <Text className="text-2xl font-bold text-foreground mb-2">No Classes Yet</Text>
              <Text className="text-muted text-center">
                Your classes will appear here once they are scheduled.
              </Text>
            </View>
          </View>
        ) : (
          <FlatList
            data={classes}
            renderItem={renderClassCard}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            contentContainerStyle={{ paddingBottom: 20 }}
          />
        )}
      </View>
    </ScreenContainer>
  );
}
