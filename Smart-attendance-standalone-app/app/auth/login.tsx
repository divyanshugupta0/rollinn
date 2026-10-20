import { useState } from "react";
import { ScrollView, Text, View, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import * as Haptics from "expo-haptics";

export default function LoginScreen() {
  const router = useRouter();
  const { login, loading, error, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleLogin = async () => {
    try {
      clearError();
      setLocalError(null);

      if (!email.trim()) {
        setLocalError("Please enter your email");
        return;
      }

      if (!password.trim()) {
        setLocalError("Please enter your password");
        return;
      }

      await login(email, password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (err: any) {
      const errorMsg = err.message || "Login failed";
      setLocalError(errorMsg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleRegisterPress = () => {
    clearError();
    setLocalError(null);
    router.push("/auth/register");
  };

  const displayError = localError || error;

  return (
    <ScreenContainer containerClassName="bg-background" edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="flex-1">
        <View className="flex-1 justify-center px-6 py-8">
          {/* Header */}
          <View className="mb-8 items-center">
            <Text className="text-4xl font-bold text-foreground mb-2">Smart Attendance</Text>
            <Text className="text-base text-muted text-center">Sign in to your account</Text>
          </View>

          {/* Error Message */}
          {displayError && (
            <View className="mb-6 bg-error/10 border border-error rounded-lg p-4">
              <Text className="text-error text-sm font-medium">{displayError}</Text>
            </View>
          )}

          {/* Email Input */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-foreground mb-2">Email Address</Text>
            <TextInput
              className="bg-surface border border-border rounded-lg px-4 py-3 text-foreground"
              placeholder="Enter your email"
              placeholderTextColor="#9BA1A6"
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
              value={email}
              onChangeText={setEmail}
            />
          </View>

          {/* Password Input */}
          <View className="mb-6">
            <Text className="text-sm font-medium text-foreground mb-2">Password</Text>
            <TextInput
              className="bg-surface border border-border rounded-lg px-4 py-3 text-foreground"
              placeholder="Enter your password"
              placeholderTextColor="#9BA1A6"
              secureTextEntry
              editable={!loading}
              value={password}
              onChangeText={setPassword}
            />
          </View>

          {/* Login Button */}
          <Pressable
            onPress={handleLogin}
            disabled={loading}
            style={({ pressed }) => [
              {
                transform: [{ scale: pressed && !loading ? 0.97 : 1 }],
                opacity: loading ? 0.6 : 1,
              },
            ]}
          >
            <View className="bg-primary rounded-lg py-3 items-center justify-center">
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text className="text-white font-semibold text-base">Sign In</Text>
              )}
            </View>
          </Pressable>

          {/* Register Link */}
          <View className="mt-6 flex-row justify-center items-center">
            <Text className="text-muted text-sm">Don't have an account? </Text>
            <Pressable onPress={handleRegisterPress} disabled={loading}>
              <Text className="text-primary font-semibold text-sm">Sign Up</Text>
            </Pressable>
          </View>

          {/* Info Section */}
          <View className="mt-8 bg-surface rounded-lg p-4 border border-border">
            <Text className="text-xs font-medium text-foreground mb-2">Demo Credentials</Text>
            <Text className="text-xs text-muted leading-relaxed">
              Create a new account or use test credentials to explore the app's attendance features.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
