import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
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

const API_URL =
  "https://hiking-trail-guide-cw985my7i-villamasj.vercel.app";

const MAIN = "#694F2E";
const SECONDARY = "#C9AD8A";
const BACKGROUND = "#F7F3EC";
const WHITE = "#FFFFFF";
const TEXT = "#30271F";
const MUTED = "#7D746B";
const BORDER = "#E5D9C9";

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert(
        "Missing Information",
        "Please enter your email and password."
      );
      return;
    }

    if (loading) return;

    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/api/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        Alert.alert(
          "Login Failed",
          data.message || "Incorrect email or password."
        );
        return;
      }

      if (!data.token || !data.user) {
        Alert.alert(
          "Login Failed",
          "The server returned an invalid response. Please try again."
        );
        return;
      }

      await SecureStore.setItemAsync("authToken", data.token);
      await SecureStore.setItemAsync(
        "authUser",
        JSON.stringify(data.user)
      );

      router.replace("/(tabs)/home");
    } catch (error) {
      console.error("Login error:", error);

      Alert.alert(
        "Connection Error",
        "Unable to connect to the server. Please check your internet connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = () => {
    router.push("/signup");
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={styles.topLabel}>
            <Text style={styles.topLabelText}>
              YOUR NEXT ADVENTURE STARTS HERE
            </Text>
          </View>

          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Text style={styles.mountainIcon}>⛰</Text>
            </View>

            <Text style={styles.title}>
              Welcome Back, Explorer
            </Text>

            <Text style={styles.subtitle}>
              Ready for your next adventure? Sign in to
              discover trails and continue exploring nature.
            </Text>
          </View>

          <View style={styles.featureCard}>
            <Text style={styles.featureIcon}>🥾</Text>

            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>
                Your next trail awaits
              </Text>

              <Text style={styles.featureDescription}>
                Sign in and find your path to adventure.
              </Text>
            </View>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Sign In</Text>

            <Text style={styles.formSubtitle}>
              Enter your account details to continue.
            </Text>

            <View style={styles.field}>
              <Text style={styles.label}>Email Address</Text>

              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#A39A90"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
                editable={!loading}
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>

              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="#A39A90"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                value={password}
                onChangeText={setPassword}
                editable={!loading}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.button,
                loading && styles.buttonDisabled,
              ]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={WHITE} />
              ) : (
                <>
                  <Text style={styles.buttonText}>Sign In</Text>
                  <Text style={styles.buttonArrow}>→</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.registerContainer}>
              <Text style={styles.registerPrompt}>
                Don't have an account?
              </Text>

              <TouchableOpacity
                onPress={handleRegister}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Text style={styles.registerText}>
                  Create Account
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.footer}>
            FIND YOUR PATH. ENJOY THE JOURNEY.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 28,
    maxWidth: 520,
    width: "100%",
    alignSelf: "center",
  },
  topLabel: {
    alignSelf: "center",
    backgroundColor: "#EDE3D5",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 24,
  },
  topLabelText: {
    color: MAIN,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.3,
  },
  header: {
    alignItems: "center",
    marginBottom: 25,
  },
  iconCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: MAIN,
    borderWidth: 5,
    borderColor: "#E8D8C3",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  mountainIcon: {
    fontSize: 36,
    color: WHITE,
  },
  title: {
    fontSize: 27,
    fontWeight: "800",
    color: MAIN,
    textAlign: "center",
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: MUTED,
    textAlign: "center",
    maxWidth: 330,
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEE5D9",
    borderRadius: 14,
    padding: 15,
    marginBottom: 22,
  },
  featureIcon: {
    fontSize: 29,
    marginRight: 13,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: MAIN,
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 12,
    lineHeight: 18,
    color: MUTED,
  },
  formCard: {
    backgroundColor: WHITE,
    padding: 22,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: MAIN,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  formTitle: {
    fontSize: 23,
    fontWeight: "800",
    color: TEXT,
    marginBottom: 5,
  },
  formSubtitle: {
    fontSize: 13,
    color: MUTED,
    lineHeight: 19,
    marginBottom: 23,
  },
  field: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: TEXT,
    marginBottom: 8,
  },
  input: {
    height: 49,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    color: TEXT,
    backgroundColor: "#FDFBF8",
  },
  button: {
    height: 52,
    backgroundColor: MAIN,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    paddingHorizontal: 18,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "800",
  },
  buttonArrow: {
    color: WHITE,
    fontSize: 21,
    marginLeft: 10,
    marginTop: -2,
  },
  registerContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 23,
  },
  registerPrompt: {
    color: MUTED,
    fontSize: 12,
    marginRight: 5,
  },
  registerText: {
    color: MAIN,
    fontSize: 12,
    fontWeight: "800",
  },
  footer: {
    textAlign: "center",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#9C856C",
    marginTop: 27,
  },
});