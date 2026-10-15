import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  background: '#F7F0E6',
  brown: '#3B2818',
  tan: '#C9AD8A',
  cream: '#FFFFFF',
  text: '#352719',
  muted: '#6E573F',
  border: '#E8DCCB',
  green: '#55734A',
};

export default function SettingsInfoPage({
  title,
  subtitle,
  icon,
  sections,
  footer,
}) {
  const router = useRouter();

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
            color={COLORS.cream}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons
              name={icon}
              size={30}
              color={COLORS.brown}
            />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((item) => (
              <View key={item.title} style={styles.infoCard}>
                <View style={styles.itemIcon}>
                  <MaterialCommunityIcons
                    name={item.icon}
                    size={20}
                    color={COLORS.green}
                  />
                </View>
                <View style={styles.itemContent}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemDescription}>
                    {item.description}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ))}

        {footer ? <Text style={styles.footer}>{footer}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: COLORS.brown,
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
    color: COLORS.cream,
    fontSize: 17,
    fontWeight: '800',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 36,
  },
  hero: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 22,
  },
  heroIcon: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: COLORS.tan,
    marginBottom: 14,
  },
  title: {
    color: COLORS.text,
    fontSize: 25,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    maxWidth: 320,
    marginTop: 8,
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  section: {
    marginTop: 14,
  },
  sectionTitle: {
    marginBottom: 10,
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 15,
    marginBottom: 10,
    borderRadius: 16,
    backgroundColor: COLORS.cream,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  itemIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderRadius: 12,
    backgroundColor: '#EEF1E8',
  },
  itemContent: {
    flex: 1,
    paddingTop: 1,
  },
  itemTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '800',
  },
  itemDescription: {
    marginTop: 5,
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  footer: {
    marginTop: 14,
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
