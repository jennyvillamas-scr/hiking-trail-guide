import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const API_URL = "https://hiking-trail-guide-api.vercel.app";
const MAIN = "#694F2E";
const SECONDARY = "#C9AD8A";
const WHITE = "#FFFFFF";
const TEXT = "#30271F";
const MUTED = "#7D746B";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { token: tokenParam } = useLocalSearchParams();
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] =
    useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!token) {
      Alert.alert(
        "Invalid Link",
        "This password reset link is invalid or has expired."
      );
      return;
    }

    if (password.length < 8) {
      Alert.alert(
        "Password Too Short",
        "Your password must be at least 8 characters long."
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(
        "Passwords Don't Match",
        "Please enter the same password in both fields."
      );
      return;
    }

    if (loading) return;

    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.message || "Unable to reset your password.");
      }

      Alert.alert(
        "Password Updated",
        "Your password has been reset. You can now sign in.",
        [{ text: "Continue", onPress: () => router.replace("/login") }]
      );
    } catch (error) {
      console.error("Password reset error:", error);
      Alert.alert(
        "Password Reset",
        error.message ||
          "Unable to connect to the server. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={styles.eyebrow}>ACCOUNT RECOVERY</Text>
            <Text style={styles.title}>Choose a new password</Text>
            <Text style={styles.description}>
              Use at least 8 characters for your new password.
            </Text>

            <Text style={styles.label}>New Password</Text>
            <View style={styles.passwordInputContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter a new password"
                placeholderTextColor={MUTED}
                secureTextEntry={!passwordVisible}
                autoCapitalize="none"
                autoCorrect={false}
                value={password}
                onChangeText={setPassword}
                editable={!loading}
                returnKeyType="next"
              />
              <TouchableOpacity
                style={styles.passwordVisibilityButton}
                onPress={() => setPasswordVisible((visible) => !visible)}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel={
                  passwordVisible ? "Hide password" : "Show password"
                }
                hitSlop={8}
              >
                <MaterialCommunityIcons
                  name={passwordVisible ? "eye-off-outline" : "eye-outline"}
                  size={22}
                  color={MAIN}
                />
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, styles.confirmLabel]}>
              Confirm New Password
            </Text>
            <View style={styles.passwordInputContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter the password again"
                placeholderTextColor={MUTED}
                secureTextEntry={!confirmPasswordVisible}
                autoCapitalize="none"
                autoCorrect={false}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!loading}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
              <TouchableOpacity
                style={styles.passwordVisibilityButton}
                onPress={() =>
                  setConfirmPasswordVisible((visible) => !visible)
                }
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel={
                  confirmPasswordVisible
                    ? "Hide password"
                    : "Show password"
                }
                hitSlop={8}
              >
                <MaterialCommunityIcons
                  name={
                    confirmPasswordVisible
                      ? "eye-off-outline"
                      : "eye-outline"
                  }
                  size={22}
                  color={MAIN}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={WHITE} />
              ) : (
                <Text style={styles.buttonText}>Update Password</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: MAIN,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 22,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    padding: 24,
    borderRadius: 20,
    backgroundColor: SECONDARY,
  },
  eyebrow: {
    color: MAIN,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  title: {
    marginTop: 8,
    color: MAIN,
    fontSize: 26,
    fontWeight: "900",
  },
  description: {
    marginTop: 8,
    marginBottom: 22,
    color: "#493522",
    fontSize: 14,
    lineHeight: 21,
  },
  label: {
    marginBottom: 8,
    color: MAIN,
    fontSize: 13,
    fontWeight: "800",
  },
  confirmLabel: {
    marginTop: 16,
  },
  input: {
    height: 54,
    paddingHorizontal: 15,
    borderWidth: 1.5,
    borderColor: "#D6C2A9",
    borderRadius: 12,
    backgroundColor: WHITE,
    color: TEXT,
    fontSize: 15,
  },
  passwordInputContainer: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#D6C2A9",
    borderRadius: 12,
    backgroundColor: WHITE,
  },
  passwordInput: {
    flex: 1,
    height: "100%",
    paddingHorizontal: 15,
    fontSize: 15,
    color: TEXT,
  },
  passwordVisibilityButton: {
    width: 46,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    minHeight: 52,
    marginTop: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: MAIN,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: WHITE,
    fontSize: 15,
    fontWeight: "800",
  },
});
