import { useRouter } from "expo-router";
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

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    if (loading) return;

    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.message || "Unable to request a password reset right now."
        );
      }

      setSubmitted(true);
    } catch (error) {
      console.error("Password reset request error:", error);
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
            <Text style={styles.title}>Forgot password?</Text>
            <Text style={styles.description}>
              Enter the email address associated with your PEAKLY account.
              We&apos;ll send a link to reset your password.
            </Text>

            {submitted ? (
              <View style={styles.successBox}>
                <Text style={styles.successText}>
                  If an account exists for that email, a password reset link
                  will be sent. Check your inbox.
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.label}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={MUTED}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  value={email}
                  onChangeText={setEmail}
                  editable={!loading}
                  returnKeyType="send"
                  onSubmitEditing={handleSubmit}
                />
                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleSubmit}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color={WHITE} />
                  ) : (
                    <Text style={styles.buttonText}>Send Reset Link</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.replace("/login")}
              disabled={loading}
            >
              <Text style={styles.backButtonText}>Back to Sign In</Text>
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
  button: {
    minHeight: 52,
    marginTop: 16,
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
  successBox: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#F7F0E6",
  },
  successText: {
    color: MAIN,
    fontSize: 14,
    lineHeight: 21,
  },
  backButton: {
    alignSelf: "center",
    marginTop: 20,
    paddingVertical: 8,
  },
  backButtonText: {
    color: MAIN,
    fontSize: 13,
    fontWeight: "800",
  },
});
