import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getFavorites,
  refreshFavoritesFromServer,
  removeFavorite,
  syncFavorites,
} from '../../services/favoriteService';

const COLORS = {
  brown: '#694F2E',
  tan: '#C9AD8A',
  cream: '#F7F0E6',
  background: '#FBF7F0',
  border: '#E8DCCB',
  text: '#352719',
  muted: '#77877B',
  red: '#D94F55',
  white: '#FFFFFF',
};

const TRAIL_IMAGES = {
  'Mt. Apo': require('../../assets/trails/mount-apo.jpeg'),
  'Mt. Babag': require('../../assets/trails/babag.jpeg'),
  'Mt. Balagbag': require('../../assets/trails/mount-balagbag.jpeg'),
  'Mt. Batolusong': require('../../assets/trails/mount-batolusong.jpeg'),
  'Mt. Batulao': require('../../assets/trails/mount-batulao.jpeg'),
  'Casino Peak (Lugsangan Peak)': require('../../assets/trails/casino-peak.jpeg'),
  'Mt. Daguldol': require('../../assets/trails/mount-daguldol.jpeg'),
  'Mt. Daraitan': require('../../assets/trails/mount-daraitan.jpeg'),
  'Mt. Dulang-Dulang': require('../../assets/trails/mount-dulang-dulang.jpeg'),
  'Mt. Guiting-Guiting': require('../../assets/trails/mount-guiting-guiting.jpeg'),
  'Mt. Hibok-Hibok': require('../../assets/trails/mount-hibok-hibok.jpeg'),
  'Mt. Kalatungan': require('../../assets/trails/mount-kalatungan.jpeg'),
  'Mt. Kanlaon': require('../../assets/trails/mount-kanlaon.jpeg'),
  'Mt. Kitanglad': require('../../assets/trails/mount-kitanglad.jpeg'),
  'Mt. Maculot': require('../../assets/trails/mount-maculot.jpeg'),
  'Mt. Manunggal': require('../../assets/trails/mount-manunggal.jpeg'),
  'Masungi Georeserve': require('../../assets/trails/mount-masungi.jpeg'),
  'Mayon Volcano': require('../../assets/trails/mount-mayon.jpeg'),
  'Mt. Pico de Loro': require('../../assets/trails/mount-pico-de-loro.jpeg'),
  'Mt. Pinatubo Crater': require('../../assets/trails/mount-pinatubo.jpeg'),
  'Mt. Pulag': require('../../assets/trails/mount-pulag.jpeg'),
  'Sirao Peak (Mt. Kan-irag)': require('../../assets/trails/sirao-peak.jpeg'),
  'Spartan Trail': require('../../assets/trails/spartan-trail.jpeg'),
  'Starbuk’s Trail': require('../../assets/trails/starbuks-trail.jpeg'),
  'Mt. Talamitam': require('../../assets/trails/mount-talamitam.jpeg'),
  'Mt. Ulap': require('../../assets/trails/mount-ulap.jpeg'),
};

const DEFAULT_TRAIL_IMAGE = require('../../assets/trails/default-trail.jpeg');

function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\s+/g, ' ');
}

const NORMALIZED_IMAGES = Object.fromEntries(
  Object.entries(TRAIL_IMAGES).map(([name, image]) => [
    normalizeName(name),
    image,
  ])
);

function getTrailImage(trail) {
  const name = normalizeName(trail?.name || trail?.title);
  return NORMALIZED_IMAGES[name] || DEFAULT_TRAIL_IMAGE;
}

function FavoritePhoto({ trail }) {
  const [imageFailed, setImageFailed] = useState(false);

  const imageSource = getTrailImage(trail);

  useEffect(() => {
    setImageFailed(false);
  }, [trail?.id, trail?.name]);

  return (
    <View style={styles.photoContainer}>
      <Image
        source={imageFailed ? DEFAULT_TRAIL_IMAGE : imageSource}
        style={styles.photo}
        resizeMode="cover"
        onError={() => {
          if (!imageFailed) {
            setImageFailed(true);
          }
        }}
      />
    </View>
  );
}

export default function FavoritesScreen() {
  const router = useRouter();

  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openingTrailId, setOpeningTrailId] = useState(null);
  const [removingTrailId, setRemovingTrailId] = useState(null);

  const loadFavorites = useCallback(async (refresh = false) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const saved = await getFavorites();
      setFavorites(Array.isArray(saved) ? saved : []);
      setLoading(false);

      await syncFavorites();
      const latest = await refreshFavoritesFromServer();
      setFavorites(latest);
    } catch (error) {
      console.warn('Unable to refresh favorites from server:', error);

      if (refresh) {
        Alert.alert(
          'Unable to refresh favorites',
          'Your saved trails could not be refreshed. Please check your connection and try again.'
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setOpeningTrailId(null);
      loadFavorites();
    }, [loadFavorites])
  );

  const openTrail = useCallback(
    (trail) => {
      if (!trail?.id) {
        Alert.alert(
          'Trail unavailable',
          'This favorite does not have a valid trail ID. Refresh your favorites and try again.'
        );
        return;
      }

      if (openingTrailId !== null) {
        return;
      }

      setOpeningTrailId(String(trail.id));

      try {
        router.push({
          pathname: '/(tabs)/maps',
          params: {
            trailId: String(trail.id),
            focusTrail: 'true',
          },
        });
      } catch (error) {
        console.error('Unable to open trail:', error);
        setOpeningTrailId(null);

        Alert.alert(
          'Unable to open trail',
          'Please return to Favorites and try again.'
        );
      }
    },
    [openingTrailId, router]
  );

  const handleRemove = useCallback(
    (trail) => {
      if (!trail?.id || removingTrailId !== null) {
        return;
      }

      Alert.alert(
        'Remove Favorite',
        `Remove ${trail.name || 'this trail'} from your favorites?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              setRemovingTrailId(String(trail.id));

              try {
                const updated = await removeFavorite(trail.id);
                setFavorites(Array.isArray(updated) ? updated : []);
              } catch (error) {
                console.error('Unable to remove favorite:', error);

                Alert.alert(
                  'Unable to remove favorite',
                  'Please check your connection and try again.'
                );
              } finally {
                setRemovingTrailId(null);
              }
            },
          },
        ]
      );
    },
    [removingTrailId]
  );

  const renderFavorite = ({ item }) => {
    const itemId = String(item.id);
    const isOpening = openingTrailId === itemId;
    const isRemoving = removingTrailId === itemId;

    const distance = Number(item.distanceKm);
    const hasDistance =
      item.distanceKm !== null &&
      item.distanceKm !== undefined &&
      item.distanceKm !== '' &&
      Number.isFinite(distance);

    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.cardMain}
          onPress={() => openTrail(item)}
          activeOpacity={0.75}
          disabled={openingTrailId !== null}
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.name || 'trail'} on the map`}
        >
          <FavoritePhoto trail={item} />

          <View style={styles.details}>
            <Text style={styles.trailName} numberOfLines={2}>
              {item.name || item.title || 'Unnamed Trail'}
            </Text>

            <View style={styles.regionRow}>
              <MaterialCommunityIcons
                name="map-marker-outline"
                size={14}
                color={COLORS.muted}
              />
              <Text style={styles.region} numberOfLines={2}>
                {item.region || item.location || 'Location unavailable'}
              </Text>
            </View>

            <View style={styles.tags}>
              {item.difficulty ? (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{item.difficulty}</Text>
                </View>
              ) : null}

              {hasDistance ? (
                <View style={styles.distanceTag}>
                  <MaterialCommunityIcons
                    name="map-marker-distance"
                    size={12}
                    color={COLORS.brown}
                  />
                  <Text style={styles.distanceText}>{distance} km</Text>
                </View>
              ) : null}
            </View>

            {isOpening ? (
              <View style={styles.openingRow}>
                <ActivityIndicator size="small" color={COLORS.brown} />
                <Text style={styles.openingText}>Opening map...</Text>
              </View>
            ) : (
              <View style={styles.viewTrailRow}>
                <Text style={styles.viewTrailText}>View on map</Text>
                <MaterialCommunityIcons
                  name="arrow-top-right"
                  size={14}
                  color={COLORS.brown}
                />
              </View>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => handleRemove(item)}
          disabled={removingTrailId !== null}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.name || 'trail'} from favorites`}
        >
          {isRemoving ? (
            <ActivityIndicator size="small" color={COLORS.red} />
          ) : (
            <MaterialCommunityIcons
              name="heart"
              size={23}
              color={COLORS.red}
            />
          )}
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.tan} />
          <Text style={styles.loadingText}>
            Loading your favorites...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <FlatList
        data={favorites}
        keyExtractor={(item, index) =>
          String(item.id ?? `favorite-${index}`)
        }
        renderItem={renderFavorite}
        contentContainerStyle={[
          styles.list,
          favorites.length === 0 && styles.emptyList,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadFavorites(true)}
            tintColor={COLORS.tan}
            colors={[COLORS.brown]}
          />
        }
        ListHeaderComponent={
          <View style={styles.heading}>
            <View style={styles.headingTextContainer}>
              <Text style={styles.headingTitle}>Your Favorites</Text>
              <Text style={styles.headingSubtitle}>
                Trails saved for your next adventure.
              </Text>
            </View>

            <View style={styles.countBadge}>
              <MaterialCommunityIcons
                name="heart"
                size={15}
                color={COLORS.text}
              />
              <Text style={styles.countText}>{favorites.length}</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons
                name="heart-outline"
                size={42}
                color={COLORS.brown}
              />
            </View>

            <Text style={styles.emptyTitle}>No favorites yet</Text>

            <Text style={styles.emptyDescription}>
              Explore the map and save trails you want to visit.
              Your saved trails will appear here.
            </Text>

            <TouchableOpacity
              style={styles.exploreButton}
              onPress={() => router.push('/(tabs)/maps')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="map-outline"
                size={18}
                color={COLORS.text}
              />
              <Text style={styles.exploreButtonText}>Explore Trails</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#694F2E',
  },

  list: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 32,
  },

  emptyList: {
    flexGrow: 1,
  },

  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },

  headingTextContainer: {
    flex: 1,
    paddingRight: 12,
  },

  headingTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },

  headingSubtitle: {
    fontSize: 13,
    color: '#E8DCCB',
    marginTop: 5,
    lineHeight: 18,
  },

  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 52,
    backgroundColor: '#C9AD8A',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  countText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#352719',
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#C9AD8A',
    borderRadius: 18,
    marginBottom: 14,
    padding: 10,
    shadowColor: '#352719',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },

  cardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },

  photoContainer: {
    width: 104,
    height: 116,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#694F2E',
  },

  photo: {
    width: '100%',
    height: '100%',
  },

  photoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    gap: 5,
    backgroundColor: '#694F2E',
  },

  photoFallbackText: {
    fontSize: 10,
    color: '#E8DCCB',
    textAlign: 'center',
  },

  details: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 13,
    paddingRight: 5,
    justifyContent: 'center',
  },

  trailName: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
    color: '#352719',
    letterSpacing: -0.2,
  },

  regionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 7,
    gap: 5,
  },

  region: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    color: '#5A4631',
  },

  tags: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 9,
  },

  tag: {
    backgroundColor: '#694F2E',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  tagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },

  distanceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8DCCB',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  distanceText: {
    color: '#694F2E',
    fontSize: 10,
    fontWeight: '800',
  },

  openingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },

  openingText: {
    fontSize: 11,
    color: '#694F2E',
    fontWeight: '700',
  },

  viewTrailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
  },

  viewTrailText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#694F2E',
  },

  removeButton: {
    width: 40,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 3,
    borderRadius: 12,
    backgroundColor: '#E8DCCB',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#694F2E',
    gap: 12,
  },

  loadingText: {
    fontSize: 14,
    color: '#E8DCCB',
    fontWeight: '600',
  },

  emptyState: {
    flex: 1,
    minHeight: 350,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },

  emptyIcon: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#C9AD8A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },

  emptyTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },

  emptyDescription: {
    fontSize: 13,
    lineHeight: 20,
    color: '#E8DCCB',
    textAlign: 'center',
    maxWidth: 290,
  },

  exploreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#C9AD8A',
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 13,
    marginTop: 22,
  },

  exploreButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#352719',
  },
});