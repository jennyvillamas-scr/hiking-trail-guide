import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const API_URL = 'https://hiking-trail-guide-api.vercel.app/api';
const COLORS = {
  main: '#694F2E',
  secondary: '#C9AD8A',
  white: '#FFFFFF',
  text: '#352719',
  muted: '#6E573F',
  border: '#B89A75',
};

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [saving, setSaving] = useState(false);

  const togglePasswordVisibility = (field) => {
    setVisiblePasswords((previous) => ({
      ...previous,
      [field]: !previous[field],
    }));
  };

  const updatePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Missing information', 'Please complete all password fields.');
      return;
    }

    if (newPassword.length < 8) {
      Alert.alert(
        'Password too short',
        'Your new password must be at least 8 characters long.'
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Please confirm your new password.');
      return;
    }

    if (saving) return;

    try {
      setSaving(true);
      const token = await SecureStore.getItemAsync('authToken');
      if (!token) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      const response = await fetch(`${API_URL}/profile/password`, {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Unable to change your password.');
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setVisiblePasswords({});
      Alert.alert('Password changed', 'Your password has been updated.');
    } catch (error) {
      console.error('Change password error:', error);
      Alert.alert(
        'Unable to change password',
        error.message || 'Please check your connection and try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const renderPasswordField = (field, label, placeholder, value, onChangeText, returnKeyType, onSubmitEditing) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.muted}
          secureTextEntry={!visiblePasswords[field]}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!saving}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
        />
        <TouchableOpacity
          style={styles.visibilityButton}
          onPress={() => togglePasswordVisibility(field)}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={
            visiblePasswords[field] ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`
          }
          hitSlop={8}
        >
          <MaterialCommunityIcons
            name={visiblePasswords[field] ? 'eye-off-outline' : 'eye-outline'}
            size={21}
            color={COLORS.main}
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={22}
            color={COLORS.white}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change password</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons
                name="lock-reset"
                size={28}
                color={COLORS.main}
              />
            </View>
            <Text style={styles.title}>Update your password</Text>
            <Text style={styles.subtitle}>
              Enter your current password, then choose a new one with at least
              8 characters.
            </Text>

            {renderPasswordField(
              'current',
              'Current password',
              'Enter your current password',
              currentPassword,
              setCurrentPassword,
              'next'
            )}
            {renderPasswordField(
              'new',
              'New password',
              'Enter a new password',
              newPassword,
              setNewPassword,
              'next'
            )}
            {renderPasswordField(
              'confirm',
              'Confirm new password',
              'Enter the new password again',
              confirmPassword,
              setConfirmPassword,
              'done',
              updatePassword
            )}

            <TouchableOpacity
              style={[styles.submitButton, saving && styles.disabledButton]}
              onPress={updatePassword}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Text style={styles.submitButtonText}>Update password</Text>
                  <MaterialCommunityIcons
                    name="check"
                    size={19}
                    color={COLORS.white}
                  />
                </>
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
    backgroundColor: COLORS.main,
  },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: COLORS.main,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  headerTitle: {
    flex: 1,
    marginLeft: 8,
    color: COLORS.white,
    fontSize: 17,
    fontWeight: '800',
  },
  headerSpacer: {
    width: 40,
  },
  keyboardContainer: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    padding: 22,
    borderRadius: 20,
    backgroundColor: COLORS.secondary,
  },
  iconCircle: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: '#F7F0E6',
    marginBottom: 14,
  },
  title: {
    color: COLORS.main,
    fontSize: 23,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 7,
    marginBottom: 20,
    color: '#493522',
    fontSize: 13,
    lineHeight: 19,
  },
  field: {
    marginBottom: 15,
  },
  label: {
    marginBottom: 7,
    color: COLORS.main,
    fontSize: 12,
    fontWeight: '800',
  },
  inputContainer: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.white,
  },
  input: {
    flex: 1,
    minHeight: 50,
    paddingHorizontal: 13,
    color: COLORS.text,
    fontSize: 14,
  },
  visibilityButton: {
    width: 44,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButton: {
    minHeight: 50,
    marginTop: 3,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 12,
    backgroundColor: COLORS.main,
  },
  disabledButton: {
    opacity: 0.65,
  },
  submitButtonText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '900',
  },
});
