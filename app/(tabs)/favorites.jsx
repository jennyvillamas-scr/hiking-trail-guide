
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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
    removeFavorite,
    syncFavorites,
} from '../../services/favoriteService';

export default function FavoritesScreen() {
  const router = useRouter();

  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadFavorites = useCallback(async (refresh = false) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const saved = await getFavorites();
      setFavorites(saved);

      syncFavorites().catch(() => {});
    } catch (error) {
      Alert.alert(
        'Unable to load favorites',
        'Your saved trails could not be loaded.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFavorites();
    }, [loadFavorites])
  );

  const handleRemove = (trail) => {
    Alert.alert(
      'Remove Favorite',
      `Remove ${trail.name} from your favorites?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const updated = await removeFavorite(trail.id);
              setFavorites(updated);
            } catch {
              Alert.alert(
                'Unable to remove favorite',
                'Please try again.'
              );
            }
          },
        },
      ]
    );
  };

  const openTrail = (trail) => {
    router.push({
      pathname: '/(tabs)/maps',
      params: {
        trailId: String(trail.id),
      },
    });
  };

  const renderFavorite = ({ item }) => {
    const photo =
      Array.isArray(item.photos) && item.photos.length > 0
        ? item.photos[0]
        : null;

    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.cardMain}
          onPress={() => openTrail(item)}
          activeOpacity={0.85}
        >
          {photo ? (
            <Image
              source={{ uri: photo }}
              style={styles.photo}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.photo, styles.photoFallback]}>
              <MaterialCommunityIcons
                name="image-off-outline"
                size={28}
                color="#89938C"
              />
            </View>
          )}

          <View style={styles.details}>
            <Text style={styles.trailName} numberOfLines={2}>
              {item.name}
            </Text>

            <View style={styles.regionRow}>
              <MaterialCommunityIcons
                name="map-marker-outline"
                size={14}
                color="#77877B"
              />
              <Text style={styles.region} numberOfLines={1}>
                {item.region || 'Location unavailable'}
              </Text>
            </View>

            <View style={styles.tags}>
              {item.difficulty ? (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>
                    {item.difficulty}
                  </Text>
                </View>
              ) : null}

              {Number.isFinite(Number(item.distanceKm)) &&
              item.distanceKm !== null &&
              item.distanceKm !== '' ? (
                <View style={styles.distanceTag}>
                  <MaterialCommunityIcons
                    name="map-marker-distance"
                    size={12}
                    color="#245C43"
                  />
                  <Text style={styles.distanceText}>
                    {item.distanceKm} km
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => handleRemove(item)}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.name} from favorites`}
        >
          <MaterialCommunityIcons
            name="heart"
            size={23}
            color="#D94F55"
          />
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#245C43" />
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
        keyExtractor={(item) => String(item.id)}
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
            tintColor="#245C43"
            colors={['#245C43']}
          />
        }
        ListHeaderComponent={
          <View style={styles.heading}>
            <View>
              <Text style={styles.headingTitle}>
                Your Favorites
              </Text>
              <Text style={styles.headingSubtitle}>
                Trails saved for your next adventure.
              </Text>
            </View>

            <View style={styles.countBadge}>
              <MaterialCommunityIcons
                name="heart"
                size={15}
                color="#FFFFFF"
              />
              <Text style={styles.countText}>
                {favorites.length}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons
                name="heart-outline"
                size={42}
                color="#245C43"
              />
            </View>

            <Text style={styles.emptyTitle}>
              No favorites yet
            </Text>

            <Text style={styles.emptyDescription}>
              Explore the map and save trails you want to
              visit. Your saved trails will appear here.
            </Text>

            <TouchableOpacity
              style={styles.exploreButton}
              onPress={() => router.push('/(tabs)/maps')}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons
                name="map-outline"
                size={18}
                color="#FFFFFF"
              />
              <Text style={styles.exploreButtonText}>
                Explore Trails
              </Text>
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
    backgroundColor: '#F7F0E6',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
  },
  emptyList: {
    flexGrow: 1,
  },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  headingTitle: {
    fontSize: 23,
    fontWeight: '900',
    color: '#694F2E',
  },
  headingSubtitle: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 18,
    color: '#6E573F',
  },
  countBadge: {
    minWidth: 44,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 11,
    backgroundColor: '#694F2E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  countText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FBF7F0',
    borderRadius: 16,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#DCC6A9',
    elevation: 2,
    shadowColor: '#352719',
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  cardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  photo: {
    width: 104,
    height: 112,
    borderRadius: 11,
    backgroundColor: '#E8DCCB',
  },
  photoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: {
    flex: 1,
    paddingLeft: 12,
    paddingRight: 5,
  },
  trailName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#352719',
    lineHeight: 20,
  },
  regionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 3,
  },
  region: {
    flex: 1,
    fontSize: 11,
    color: '#6E573F',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  tag: {
    backgroundColor: '#E8DCCB',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
  },
  tagText: {
    color: '#694F2E',
    fontSize: 10,
    fontWeight: '800',
  },
  distanceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EFE4D5',
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 7,
  },
  distanceText: {
    color: '#694F2E',
    fontSize: 10,
    fontWeight: '800',
  },
  removeButton: {
    width: 38,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#6E573F',
  },
  emptyState: {
    flex: 1,
    minHeight: 380,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  emptyIcon: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#E8DCCB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#694F2E',
  },
  emptyDescription: {
    marginTop: 9,
    fontSize: 12,
    lineHeight: 19,
    color: '#6E573F',
    textAlign: 'center',
    maxWidth: 280,
  },
  exploreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#694F2E',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 22,
  },
  exploreButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
});
