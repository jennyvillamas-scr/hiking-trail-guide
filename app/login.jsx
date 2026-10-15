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
    backgroundColor: MAIN,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 18,
    maxWidth: 520,
    width: "100%",
    alignSelf: "center",
  },
  topLabel: {
    alignSelf: "center",
    backgroundColor: SECONDARY,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    marginBottom: 14,
  },
  topLabelText: {
    color: MAIN,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  header: {
    alignItems: "center",
    marginBottom: 18,
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: SECONDARY,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "#E7D5BE",
  },
  mountainIcon: {
    fontSize: 29,
    color: MAIN,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: WHITE,
    textAlign: "center",
    marginBottom: 6,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: "#F0E5D8",
    textAlign: "center",
    maxWidth: 310,
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SECONDARY,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  featureIcon: {
    fontSize: 25,
    marginRight: 12,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: MAIN,
    marginBottom: 3,
  },
  featureDescription: {
    fontSize: 12,
    lineHeight: 17,
    color: "#493522",
  },
  formCard: {
    backgroundColor: SECONDARY,
    padding: 22,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D9B995",
    shadowColor: "#201509",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 6,
  },
  formTitle: {
    fontSize: 27,
    fontWeight: "800",
    color: MAIN,
    marginBottom: 5,
  },
  formSubtitle: {
    fontSize: 13,
    color: "#493522",
    lineHeight: 19,
    marginBottom: 20,
  },
  field: {
    marginBottom: 17,
  },
  label: {
    fontSize: 13,
    fontWeight: "800",
    color: MAIN,
    marginBottom: 8,
  },
  input: {
    height: 54,
    borderWidth: 1.5,
    borderColor: "#D6C2A9",
    borderRadius: 12,
    paddingHorizontal: 15,
    fontSize: 15,
    color: TEXT,
    backgroundColor: WHITE,
  },
  button: {
    height: 54,
    backgroundColor: MAIN,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
    paddingHorizontal: 18,
    shadowColor: MAIN,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: WHITE,
    fontSize: 15,
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
    marginTop: 20,
  },
  registerPrompt: {
    color: "#493522",
    fontSize: 12,
    marginRight: 5,
  },
  registerText: {
    color: MAIN,
    fontSize: 12,
    fontWeight: "900",
  },
  footer: {
    textAlign: "center",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: "#E8D6C0",
    marginTop: 18,
  },
});