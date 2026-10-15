import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Keyboard,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { DIFFICULTY_COLORS } from '../constants/trailConfig';
import {
  DEFAULT_TRAIL_IMAGE,
  getTrailImages,
} from '../constants/trailImages';

const API_URL = 'https://hiking-trail-guide-api.vercel.app';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_H * 0.62;

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value ?? '—'}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Stars({ rating, onSelect, size = 25 }) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => onSelect?.(star)}
          disabled={!onSelect}
          activeOpacity={0.7}
          accessibilityRole={onSelect ? 'button' : undefined}
          accessibilityLabel={`${star} star${star > 1 ? 's' : ''}`}
        >
          <Text
            style={{
              fontSize: size,
              color: star <= rating ? '#F59E0B' : '#D1D5DB',
            }}
          >
            ★
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function formatReviewDate(value) {
  if (!value) return 'Recently';

  const date = new Date(
    value.includes?.('T') ? value : `${value.replace(' ', 'T')}Z`
  );

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString();
}

export default function TrailSheet({
  trail,
  onClose,
  onGetDirections,
  isFavorite = false,
  onToggleFavorite,
  favoriteLoading = false,
}) {
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  const [photoIndex, setPhotoIndex] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviews, setReviews] = useState([]);
  const [averageRating, setAverageRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewsError, setReviewsError] = useState('');

  const trailKey =
    trail?.id != null ? String(trail.id) : trail?.name ?? '';

  const trailImages = getTrailImages(trail);

  useEffect(() => {
    if (trail) {
      setPhotoIndex(0);
      setReviewComment('');
      setReviewRating(5);

      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: SHEET_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [trail, translateY]);

  const loadReviews = async () => {
    if (!trailKey) return;

    setReviewsLoading(true);
    setReviewsError('');

    try {
      const response = await fetch(
        `${API_URL}/api/trails/${encodeURIComponent(trailKey)}/reviews`
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Unable to load reviews.');
      }

      setReviews(Array.isArray(data.reviews) ? data.reviews : []);
      setAverageRating(Number(data.averageRating) || 0);
      setReviewCount(Number(data.count) || 0);
    } catch (error) {
      setReviewsError(
        error.message || 'Could not connect to the review service.'
      );
    } finally {
      setReviewsLoading(false);
    }
  };

  useEffect(() => {
    if (!trailKey) {
      setReviews([]);
      setAverageRating(0);
      setReviewCount(0);
      setReviewsError('');
      return;
    }

    let cancelled = false;

    async function fetchReviews() {
      setReviewsLoading(true);
      setReviewsError('');
      setReviews([]);
      setAverageRating(0);
      setReviewCount(0);

      try {
        const response = await fetch(
          `${API_URL}/api/trails/${encodeURIComponent(trailKey)}/reviews`
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || 'Unable to load reviews.');
        }

        if (cancelled) return;

        setReviews(Array.isArray(data.reviews) ? data.reviews : []);
        setAverageRating(Number(data.averageRating) || 0);
        setReviewCount(Number(data.count) || 0);
      } catch (error) {
        if (!cancelled) {
          setReviewsError(
            error.message || 'Could not connect to the review service.'
          );
        }
      } finally {
        if (!cancelled) {
          setReviewsLoading(false);
        }
      }
    }

    fetchReviews();

    return () => {
      cancelled = true;
    };
  }, [trailKey]);

  const openDirections = () => {
    if (!trail) return;

    if (typeof onGetDirections === 'function') {
      onGetDirections(trail);
      return;
    }

    const latitude = Number(trail.latitude ?? trail.lat);
    const longitude = Number(trail.longitude ?? trail.lng ?? trail.lon);
    const name = trail.name ?? 'Hiking Trail';

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      Alert.alert(
        'Location unavailable',
        'Coordinates for this trail are not available.'
      );
      return;
    }

    const label = encodeURIComponent(name);

    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${latitude},${longitude}&q=${label}`,
      android: `geo:0,0?q=${latitude},${longitude}(${label})`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
    });

    if (url) {
      Linking.openURL(url).catch(() => {
        Alert.alert('Unable to open maps', 'Please try again.');
      });
    }
  };

  const submitReview = async () => {
    const comment = reviewComment.trim();

    if (!comment) {
      Alert.alert(
        'Write a comment',
        'Please share your experience before submitting.'
      );
      return;
    }

    if (!trailKey) {
      Alert.alert('Error', 'The selected trail could not be identified.');
      return;
    }

    if (submittingReview) return;

    setSubmittingReview(true);

    try {
      const token = await SecureStore.getItemAsync('authToken');

      if (!token) {
        Alert.alert(
          'Login required',
          'Please log in before posting a trail review.'
        );
        return;
      }

      const response = await fetch(
        `${API_URL}/api/trails/${encodeURIComponent(trailKey)}/reviews`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            rating: reviewRating,
            comment,
          }),
        }
      );

      const data = await response.json();

      if (response.status === 401 || response.status === 403) {
        Alert.alert(
          'Session expired',
          'Please log in again before posting a review.'
        );
        return;
      }

      if (!response.ok || !data.success || !data.review) {
        throw new Error(data.message || 'Failed to save your review.');
      }

      setReviewComment('');
      setReviewRating(5);
      Keyboard.dismiss();

      await loadReviews();

      Alert.alert('Review posted', 'Your review has been saved and shared.');
    } catch (error) {
      Alert.alert(
        'Could not post review',
        error.message || 'Please check your connection and try again.'
      );
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <Animated.View
      pointerEvents={trail ? 'auto' : 'none'}
      style={[styles.sheet, { transform: [{ translateY }] }]}
    >
      {trail && (
        <>
          <View style={styles.handle} />

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close trail details"
          >
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                setPhotoIndex(
                  Math.round(
                    event.nativeEvent.contentOffset.x / SCREEN_W
                  )
                );
              }}
            >
              {trailImages.map((image, index) => (
                <Image
                  key={`${trailKey}-${index}`}
                  source={image || DEFAULT_TRAIL_IMAGE}
                  style={styles.photo}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>

            <View style={styles.dots}>
              {trailImages.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    index === photoIndex && styles.dotActive,
                  ]}
                />
              ))}
            </View>

            <View style={styles.body}>
              <View style={styles.titleRow}>
                <View style={styles.titleInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.title}>{trail.name}</Text>

                    <TouchableOpacity
                      style={[
                        styles.favoriteButton,
                        isFavorite && styles.favoriteButtonActive,
                      ]}
                      onPress={() => onToggleFavorite?.(trail)}
                      disabled={
                        favoriteLoading ||
                        typeof onToggleFavorite !== 'function'
                      }
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={
                        isFavorite
                          ? `Remove ${trail.name} from favorites`
                          : `Add ${trail.name} to favorites`
                      }
                    >
                      <MaterialCommunityIcons
                        name={isFavorite ? 'heart' : 'heart-outline'}
                        size={25}
                        color={isFavorite ? '#E11D48' : '#64748B'}
                      />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.region}>📍 {trail.region}</Text>
                </View>

                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor:
                        DIFFICULTY_COLORS[trail.difficulty] ?? '#64748b',
                    },
                  ]}
                >
                  <Text style={styles.badgeText}>
                    {trail.difficulty}
                  </Text>
                </View>
              </View>

              <View style={styles.statsRow}>
                <Stat
                  label="Distance"
                  value={`${trail.distanceKm ?? '—'} km`}
                />
                <Stat
                  label="Elevation"
                  value={`${trail.elevationM ?? '—'} m`}
                />
                <Stat label="Duration" value={trail.duration} />
              </View>

              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.paragraph}>
                {trail.description}
              </Text>

              <Text style={styles.sectionTitle}>Highlights</Text>

              <View style={styles.chipRow}>
                {(trail.highlights ?? []).map((highlight, index) => (
                  <View key={`${highlight}-${index}`} style={styles.chip}>
                    <Text style={styles.chipText}>{highlight}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.sectionTitle}>Best season</Text>
              <Text style={styles.paragraph}>
                {trail.bestSeason}
              </Text>

              <TouchableOpacity
                style={styles.button}
                onPress={openDirections}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>Get Directions</Text>
              </TouchableOpacity>

              <View style={styles.reviewsSection}>
                <View style={styles.reviewsHeading}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>
                      Reviews &amp; Comments
                    </Text>
                    <Text style={styles.reviewSubtitle}>
                      Share your experience on this trail.
                    </Text>
                  </View>

                  <View style={styles.reviewCountBadge}>
                    <Text style={styles.reviewCountText}>
                      {reviewCount}
                    </Text>
                  </View>
                </View>

                <View style={styles.ratingSummary}>
                  <View style={styles.ratingNumberContainer}>
                    <Text style={styles.ratingNumber}>
                      {reviewCount ? averageRating.toFixed(1) : '—'}
                    </Text>
                    <Text style={styles.ratingOutOf}>
                      {reviewCount
                        ? `out of 5 · ${reviewCount} ${
                            reviewCount === 1 ? 'review' : 'reviews'
                          }`
                        : 'No ratings yet'}
                    </Text>
                  </View>

                  <Stars
                    rating={Math.round(averageRating)}
                    size={21}
                  />
                </View>

                <View style={styles.reviewForm}>
                  <Text style={styles.formTitle}>Write a review</Text>
                  <Text style={styles.inputLabel}>Your rating</Text>

                  <Stars
                    rating={reviewRating}
                    onSelect={setReviewRating}
                    size={32}
                  />

                  <Text style={styles.inputLabel}>Your experience</Text>

                  <TextInput
                    value={reviewComment}
                    onChangeText={setReviewComment}
                    placeholder="How was the trail? Share tips, conditions, or your experience..."
                    placeholderTextColor="#9CA3AF"
                    style={styles.commentInput}
                    multiline
                    textAlignVertical="top"
                    maxLength={1000}
                    editable={!submittingReview}
                  />

                  <Text style={styles.characterCount}>
                    {reviewComment.length}/1000
                  </Text>

                  <TouchableOpacity
                    style={[
                      styles.submitReviewButton,
                      (!reviewComment.trim() || submittingReview) &&
                        styles.submitReviewDisabled,
                    ]}
                    onPress={submitReview}
                    disabled={!reviewComment.trim() || submittingReview}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Submit trail review"
                  >
                    {submittingReview ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.submitReviewText}>
                        Post Review
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>

                <Text style={styles.recentReviewsTitle}>
                  Hiker experiences
                </Text>

                {reviewsLoading ? (
                  <View style={styles.loadingReviews}>
                    <ActivityIndicator
                      size="small"
                      color="#694F2E"
                    />
                    <Text style={styles.loadingText}>
                      Loading reviews...
                    </Text>
                  </View>
                ) : reviewsError && reviews.length === 0 ? (
                  <View style={styles.emptyReviews}>
                    <Text style={styles.emptyReviewTitle}>
                      Unable to load reviews
                    </Text>
                    <Text style={styles.emptyReviewText}>
                      {reviewsError}
                    </Text>

                    <TouchableOpacity
                      style={styles.retryButton}
                      onPress={loadReviews}
                      disabled={reviewsLoading}
                    >
                      <Text style={styles.retryButtonText}>
                        Try Again
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : reviews.length === 0 ? (
                  <View style={styles.emptyReviews}>
                    <Text style={styles.emptyReviewIcon}>💬</Text>
                    <Text style={styles.emptyReviewTitle}>
                      No reviews yet
                    </Text>
                    <Text style={styles.emptyReviewText}>
                      Be the first to share your experience on {trail.name}.
                    </Text>
                  </View>
                ) : (
                  reviews.map((review) => {
                    const reviewerName =
                      review.reviewerName || review.name || 'Hiker';

                    return (
                      <View
                        key={String(review.id)}
                        style={styles.reviewCard}
                      >
                        <View style={styles.reviewerHeader}>
                          {review.profilePhoto ? (
                            <Image
                              source={{ uri: review.profilePhoto }}
                              style={styles.avatar}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={styles.avatar}>
                              <Text style={styles.avatarText}>
                                {reviewerName.charAt(0).toUpperCase()}
                              </Text>
                            </View>
                          )}

                          <View style={styles.reviewerInfo}>
                            <Text style={styles.reviewerName}>
                              {reviewerName}
                            </Text>
                            <Text style={styles.reviewDate}>
                              {formatReviewDate(
                                review.createdAt || review.date
                              )}
                            </Text>
                          </View>
                        </View>

                        <Stars
                          rating={Number(review.rating) || 0}
                          size={17}
                        />

                        <Text style={styles.reviewComment}>
                          {review.comment}
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>
            </View>
          </ScrollView>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SHEET_HEIGHT,
    backgroundColor: '#F7F0E6',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#352719',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#B99A72',
    marginTop: 8,
    marginBottom: 8,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 5,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#694F2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  photo: {
    width: SCREEN_W,
    height: 200,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#C9AD8A',
    marginHorizontal: 3,
  },
  dotActive: {
    backgroundColor: '#694F2E',
    width: 18,
  },
  body: {
    padding: 18,
    paddingBottom: 40,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleInfo: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flexShrink: 1,
    fontSize: 22,
    fontWeight: 'bold',
    color: '#352719',
  },
  favoriteButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8DCCB',
    borderWidth: 1,
    borderColor: '#C9AD8A',
  },
  favoriteButtonActive: {
    backgroundColor: '#DCC6A9',
  },
  region: {
    marginTop: 4,
    fontSize: 14,
    color: '#6E573F',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    marginLeft: 8,
    backgroundColor: '#694F2E',
  },
  badgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 16,
    backgroundColor: '#E8DCCB',
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#C9AD8A',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#352719',
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: '#6E573F',
    marginTop: 4,
  },
  sectionTitle: {
    marginTop: 20,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#694F2E',
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 22,
    color: '#594735',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    backgroundColor: '#E8DCCB',
    borderWidth: 1,
    borderColor: '#C9AD8A',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: {
    color: '#694F2E',
    fontSize: 13,
    fontWeight: '600',
  },
  downloadButton: {
    marginTop: 22,
    backgroundColor: '#E8DCCB',
    borderWidth: 1,
    borderColor: '#C9AD8A',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  downloadButtonSaved: {
    backgroundColor: '#E3D6C4',
  },
  downloadButtonText: {
    color: '#694F2E',
    fontWeight: '700',
    fontSize: 14,
  },
  button: {
    marginTop: 12,
    backgroundColor: '#694F2E',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  reviewsSection: {
    marginTop: 10,
  },
  reviewsHeading: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: '#6E573F',
  },
  reviewCountBadge: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#DCC6A9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  reviewCountText: {
    color: '#694F2E',
    fontWeight: '800',
    fontSize: 13,
  },
  ratingSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EFE4D5',
    borderWidth: 1,
    borderColor: '#C9AD8A',
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  ratingNumberContainer: {
    flex: 1,
  },
  ratingNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#352719',
  },
  ratingOutOf: {
    fontSize: 11,
    color: '#6E573F',
    marginTop: 2,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  reviewForm: {
    marginTop: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#C9AD8A',
    borderRadius: 14,
    backgroundColor: '#FBF7F0',
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#352719',
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#694F2E',
    marginTop: 10,
    marginBottom: 7,
  },
  commentInput: {
    minHeight: 105,
    borderWidth: 1,
    borderColor: '#C9AD8A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
    color: '#352719',
    backgroundColor: '#FFFFFF',
  },
  characterCount: {
    fontSize: 11,
    color: '#8D785F',
    textAlign: 'right',
    marginTop: 5,
  },
  submitReviewButton: {
    marginTop: 12,
    minHeight: 45,
    borderRadius: 10,
    backgroundColor: '#694F2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitReviewDisabled: {
    backgroundColor: '#B99A72',
  },
  submitReviewText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  recentReviewsTitle: {
    marginTop: 22,
    marginBottom: 10,
    fontSize: 15,
    fontWeight: '800',
    color: '#352719',
  },
  loadingReviews: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  loadingText: {
    fontSize: 12,
    color: '#6E573F',
    marginTop: 8,
  },
  emptyReviews: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 24,
    borderRadius: 14,
    backgroundColor: '#EFE4D5',
    borderWidth: 1,
    borderColor: '#C9AD8A',
  },
  emptyReviewIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  emptyReviewTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#694F2E',
    textAlign: 'center',
  },
  emptyReviewText: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 19,
    color: '#6E573F',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: '#694F2E',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  reviewCard: {
    padding: 14,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C9AD8A',
    backgroundColor: '#FBF7F0',
  },
  reviewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#DCC6A9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    overflow: 'hidden',
  },
  avatarText: {
    color: '#694F2E',
    fontSize: 15,
    fontWeight: '800',
  },
  reviewerInfo: {
    flex: 1,
  },
  reviewerName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#352719',
  },
  reviewDate: {
    fontSize: 11,
    color: '#8D785F',
    marginTop: 3,
  },
  reviewComment: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: '#594735',
  },
});
