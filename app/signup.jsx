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

const API_URL =
  "https://hiking-trail-guide-cw985my7i-villamasj.vercel.app";

const MAIN = "#694F2E";
const SECONDARY = "#C9AD8A";
const BACKGROUND = "#F7F3EC";
const WHITE = "#FFFFFF";
const TEXT = "#30271F";
const MUTED = "#7D746B";
const BORDER = "#E5D9C9";

export default function SignupScreen() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (
      !username.trim() ||
      !email.trim() ||
      !password ||
      !confirmPassword
    ) {
      Alert.alert("Missing Information", "Please fill in all fields.");
      return;
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanUsername.length < 6 || cleanUsername.length > 16) {
      Alert.alert(
        "Invalid Username",
        "Your username must be 6–16 characters long."
      );
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    if (password.length < 8) {
      Alert.alert(
        "Weak Password",
        "Your password must be at least 8 characters long."
      );
      return;
    }

    // if (new TextEncoder().encode(password).length > 72) {
    //   Alert.alert(
    //     "Password Too Long",
    //     "Please use a shorter password."
    //   );
    //   return;
    // }

    if (password !== confirmPassword) {
      Alert.alert(
        "Password Mismatch",
        "Your passwords do not match."
      );
      return;
    }

    if (loading) return;

    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/api/auth/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: cleanUsername,
            email: cleanEmail,
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        Alert.alert(
          "Registration Failed",
          data.message || "Unable to create your account."
        );
        return;
      }

      Alert.alert(
        "Welcome to PEAKLY!",
        "Your account has been created successfully. You can now sign in.",
        [
          {
            text: "Continue to Sign In",
            onPress: () => router.replace("/login"),
          },
        ]
      );
    } catch (error) {
      console.error("Signup error:", error);

      Alert.alert(
        "Connection Error",
        "Unable to connect to the server. Please check your internet connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () => {
    router.push("/login");
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

            <Text style={styles.title}>Join PEAKLY</Text>

            <Text style={styles.subtitle}>
              Create your account and start discovering
              beautiful hiking trails and outdoor adventures.
            </Text>
          </View>

          <View style={styles.benefits}>
            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>🧭</Text>
              <Text style={styles.benefitText}>Discover Trails</Text>
            </View>

            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>🥾</Text>
              <Text style={styles.benefitText}>Plan Hikes</Text>
            </View>

            <View style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>🌿</Text>
              <Text style={styles.benefitText}>Explore Nature</Text>
            </View>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Create Account</Text>

            <Text style={styles.formSubtitle}>
              Fill in your details to get started.
            </Text>

            <View style={styles.field}>
              <Text style={styles.label}>Username</Text>

              <TextInput
                style={styles.input}
                placeholder="Choose a username"
                placeholderTextColor="#A39A90"
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={setUsername}
                maxLength={16}
                editable={!loading}
                returnKeyType="next"
              />

              <Text style={styles.helper}>6–16 characters</Text>
            </View>

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
                placeholder="Create a password"
                placeholderTextColor="#A39A90"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                value={password}
                onChangeText={setPassword}
                editable={!loading}
                returnKeyType="next"
              />

              <Text style={styles.helper}>
                At least 8 characters
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Confirm Password</Text>

              <TextInput
                style={styles.input}
                placeholder="Enter your password again"
                placeholderTextColor="#A39A90"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!loading}
                returnKeyType="done"
                onSubmitEditing={handleSignup}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.button,
                loading && styles.buttonDisabled,
              ]}
              onPress={handleSignup}
              activeOpacity={0.85}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={WHITE} />
              ) : (
                <>
                  <Text style={styles.buttonText}>
                    Start Your Adventure
                  </Text>
                  <Text style={styles.buttonArrow}>→</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.terms}>
              By creating an account, you agree to use the
              trail guide responsibly and respect nature.
            </Text>
          </View>

          <View style={styles.loginContainer}>
            <Text style={styles.loginPrompt}>
              Already have an account?
            </Text>

            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={styles.loginText}>Sign In</Text>
            </TouchableOpacity>
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
    paddingHorizontal: 24,
    paddingTop: 36,
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
    marginBottom: 22,
  },
  topLabelText: {
    color: MAIN,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.3,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: MAIN,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 5,
    borderColor: "#E8D8C3",
  },
  mountainIcon: {
    fontSize: 35,
    color: WHITE,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: MAIN,
    textAlign: "center",
    letterSpacing: -0.6,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: MUTED,
    textAlign: "center",
    maxWidth: 330,
  },
  benefits: {
    flexDirection: "row",
    backgroundColor: "#EEE5D9",
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 6,
    marginBottom: 24,
  },
  benefitItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  benefitIcon: {
    fontSize: 21,
    marginBottom: 7,
  },
  benefitText: {
    fontSize: 10,
    fontWeight: "700",
    color: MAIN,
    textAlign: "center",
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
    fontSize: 22,
    fontWeight: "800",
    color: TEXT,
    marginBottom: 5,
  },
  formSubtitle: {
    fontSize: 13,
    color: MUTED,
    marginBottom: 23,
    lineHeight: 19,
  },
  field: {
    marginBottom: 16,
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
  helper: {
    fontSize: 11,
    color: MUTED,
    marginTop: 6,
  },
  button: {
    height: 52,
    backgroundColor: MAIN,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
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
  terms: {
    fontSize: 11,
    lineHeight: 17,
    color: MUTED,
    textAlign: "center",
    marginTop: 16,
  },
  loginContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 25,
  },
  loginPrompt: {
    color: MUTED,
    fontSize: 13,
    marginRight: 5,
  },
  loginText: {
    color: MAIN,
    fontSize: 13,
    fontWeight: "800",
  },
  footer: {
    textAlign: "center",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#9C856C",
    marginTop: 25,
  },
});