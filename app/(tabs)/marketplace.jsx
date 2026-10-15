
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  Image,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const GREEN = '#66544a';
const CREAM = '#F4F6F2';
const MUTED = '#89938C';
const DARK = '#26372D';

const CATEGORIES = [
  'All',
  'Backpacks',
  'Footwear',
  'Clothing',
  'Hydration',
  'Accessories',
];

const PRODUCTS = [
  {
    id: '1',
    name: 'Trail Explorer Backpack',
    category: 'Backpacks',
    price: 1899,
    description:
      'A spacious hiking backpack with multiple compartments for your essentials, snacks, and extra clothing.',
    image:
      'https://images.unsplash.com/photo-1622260614153-03223fb72052?w=800',
    brand: 'Trail Essentials',
    rating: '4.8',
    tag: 'Popular',
  },
  {
    id: '2',
    name: 'Mountain Trekking Shoes',
    category: 'Footwear',
    price: 2499,
    description:
      'Outdoor shoes designed for comfortable walks, trail exploration, and everyday hiking adventures.',
    image:
      'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
    brand: 'Outdoor Collection',
    rating: '4.7',
    tag: 'Hiking essential',
  },
  {
    id: '3',
    name: 'Adventure Water Bottle',
    category: 'Hydration',
    price: 399,
    description:
      'A reusable bottle to help you stay hydrated on day hikes and outdoor adventures.',
    image:
      'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800',
    brand: 'Peak Hydration',
    rating: '4.6',
    tag: null,
  },
  {
    id: '4',
    name: 'Lightweight Rain Jacket',
    category: 'Clothing',
    price: 1299,
    description:
      'A lightweight outer layer for changing weather conditions during your outdoor trips.',
    image:
      'https://images.unsplash.com/photo-1544923246-77307dd654cb?w=800',
    brand: 'Outdoor Collection',
    rating: '4.5',
    tag: null,
  },
  {
    id: '5',
    name: 'Compact Camping Headlamp',
    category: 'Accessories',
    price: 549,
    description:
      'A hands-free light for low-light conditions, early starts, and preparing your gear after sunset.',
    image:
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=800',
    brand: 'Trail Essentials',
    rating: '4.7',
    tag: 'Useful gear',
  },
  {
    id: '6',
    name: 'Everyday Hiking Daypack',
    category: 'Backpacks',
    price: 999,
    description:
      'A compact daypack for carrying water, snacks, personal items, and light hiking essentials.',
    image:
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800',
    brand: 'Peak Outfitters',
    rating: '4.6',
    tag: null,
  },
  {
    id: '7',
    name: 'Outdoor Trekking Poles',
    category: 'Accessories',
    price: 799,
    description:
      'Walking poles for added support and balance on suitable hiking trails.',
    image:
      'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
    brand: 'Trail Essentials',
    rating: '4.5',
    tag: null,
  },
  {
    id: '8',
    name: 'Insulated Travel Bottle',
    category: 'Hydration',
    price: 649,
    description:
      'A reusable insulated bottle for taking your favorite drinks on your next adventure.',
    image:
      'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800',
    brand: 'Peak Hydration',
    rating: '4.8',
    tag: null,
  },
];

const formatPrice = (price) =>
  `₱${price.toLocaleString('en-PH')}`;

export default function MarketplaceScreen() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [favorites, setFavorites] = useState([]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return PRODUCTS.filter((product) => {
      const matchesCategory =
        activeCategory === 'All' ||
        product.category === activeCategory;

      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query) ||
        product.brand.toLowerCase().includes(query);

      return matchesCategory && matchesSearch;
    });
  }, [search, activeCategory]);

  const toggleFavorite = (productId) => {
    setFavorites((previous) =>
      previous.includes(productId)
        ? previous.filter((id) => id !== productId)
        : [...previous, productId]
    );
  };

  const renderProduct = (product) => {
    const isFavorite = favorites.includes(product.id);

    return (
      <View key={product.id} style={styles.productCard}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setSelectedProduct(product)}
        >
          <View style={styles.productImageWrap}>
            <Image
              source={{ uri: product.image }}
              style={styles.productImage}
              resizeMode="cover"
            />

            {product.tag && (
              <View style={styles.productTag}>
                <Text style={styles.productTagText}>
                  {product.tag}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.productInfo}>
            <Text style={styles.productCategory}>
              {product.category.toUpperCase()}
            </Text>

            <Text
              style={styles.productName}
              numberOfLines={2}
            >
              {product.name}
            </Text>

            <View style={styles.ratingRow}>
              <MaterialCommunityIcons
                name="star"
                size={14}
                color="#D9A441"
              />
              <Text style={styles.ratingText}>
                {product.rating}
              </Text>
            </View>

            <Text style={styles.productPrice}>
              {formatPrice(product.price)}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.detailsButton}
            onPress={() => setSelectedProduct(product)}
            activeOpacity={0.8}
          >
            <Text style={styles.detailsButtonText}>
              View Details
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.heartButton,
              isFavorite && styles.heartButtonActive,
            ]}
            onPress={() => toggleFavorite(product.id)}
            activeOpacity={0.7}
            accessibilityLabel={
              isFavorite
                ? 'Remove saved product'
                : 'Save product'
            }
          >
            <MaterialCommunityIcons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={21}
              color={isFavorite ? '#E11D48' : GREEN}
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={styles.heroTextWrap}>
            <Text style={styles.eyebrow}>
              YOUR NEXT ADVENTURE
            </Text>

            <Text style={styles.heroTitle}>
              The Hiking{'\n'}Gear Corner
            </Text>

            <Text style={styles.heroSubtitle}>
              Find the essentials for your next trail.
            </Text>
          </View>

          <View style={styles.heroIcon}>
            <MaterialCommunityIcons
              name="bag-personal-outline"
              size={45}
              color="#FFFFFF"
            />
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.searchBox}>
            <MaterialCommunityIcons
              name="magnify"
              size={22}
              color={MUTED}
            />

            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search hiking gear..."
              placeholderTextColor={MUTED}
              returnKeyType="search"
            />

            {search.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearch('')}
              >
                <MaterialCommunityIcons
                  name="close-circle"
                  size={20}
                  color={MUTED}
                />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>
                Explore Categories
              </Text>
              <Text style={styles.sectionSubtitle}>
                Find what you need for the trail
              </Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryList}
          >
            {CATEGORIES.map((category) => {
              const active = activeCategory === category;

              return (
                <TouchableOpacity
                  key={category}
                  style={[
                    styles.categoryChip,
                    active && styles.categoryChipActive,
                  ]}
                  onPress={() => setActiveCategory(category)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      active && styles.categoryTextActive,
                    ]}
                  >
                    {category}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.productsHeading}>
            <View>
              <Text style={styles.sectionTitle}>
                {activeCategory === 'All'
                  ? 'Hiking Essentials'
                  : activeCategory}
              </Text>

              <Text style={styles.sectionSubtitle}>
                {filteredProducts.length} products to explore
              </Text>
            </View>

            <MaterialCommunityIcons
              name="view-grid-outline"
              size={23}
              color={GREEN}
            />
          </View>

          {filteredProducts.length > 0 ? (
            <View style={styles.productGrid}>
              {filteredProducts.map(renderProduct)}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="package-variant"
                size={45}
                color="#A3AEA5"
              />

              <Text style={styles.emptyTitle}>
                No products found
              </Text>

              <Text style={styles.emptySubtitle}>
                Try another search or category.
              </Text>

              <TouchableOpacity
                style={styles.resetButton}
                onPress={() => {
                  setSearch('');
                  setActiveCategory('All');
                }}
              >
                <Text style={styles.resetButtonText}>
                  Show all products
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.disclaimer}>
            <MaterialCommunityIcons
              name="information-outline"
              size={18}
              color={GREEN}
            />

            <Text style={styles.disclaimerText}>
              Product listings are for browsing purposes.
              Prices and ratings are sample data. Purchases
              are not processed in this app.
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={Boolean(selectedProduct)}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedProduct(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />

            {selectedProduct && (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalContent}
              >
                <View style={styles.modalImageWrap}>
                  <Image
                    source={{ uri: selectedProduct.image }}
                    style={styles.modalImage}
                    resizeMode="cover"
                  />

                  <TouchableOpacity
                    style={styles.modalClose}
                    onPress={() => setSelectedProduct(null)}
                  >
                    <MaterialCommunityIcons
                      name="close"
                      size={22}
                      color={DARK}
                    />
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalCategory}>
                  {selectedProduct.category.toUpperCase()}
                </Text>

                <Text style={styles.modalTitle}>
                  {selectedProduct.name}
                </Text>

                <View style={styles.modalRatingRow}>
                  <MaterialCommunityIcons
                    name="star"
                    size={17}
                    color="#D9A441"
                  />

                  <Text style={styles.modalRating}>
                    {selectedProduct.rating}
                  </Text>

                  <Text style={styles.modalRatingNote}>
                    Sample rating
                  </Text>
                </View>

                <Text style={styles.modalPrice}>
                  {formatPrice(selectedProduct.price)}
                </Text>

                <Text style={styles.descriptionHeading}>
                  Product Description
                </Text>

                <Text style={styles.descriptionText}>
                  {selectedProduct.description}
                </Text>

                <View style={styles.sellerRow}>
                  <View style={styles.sellerIcon}>
                    <MaterialCommunityIcons
                      name="store-outline"
                      size={23}
                      color={GREEN}
                    />
                  </View>

                  <View style={styles.sellerInfo}>
                    <Text style={styles.sellerLabel}>
                      Listed by
                    </Text>
                    <Text style={styles.sellerName}>
                      {selectedProduct.brand}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.buyButton}
                  activeOpacity={0.8}
                  onPress={() => {}}
                >
                  <MaterialCommunityIcons
                    name="shopping-outline"
                    size={20}
                    color="#FFFFFF"
                  />

                  <Text style={styles.buyButtonText}>
                    Buy Now
                  </Text>
                </TouchableOpacity>

                <Text style={styles.staticNote}>
                  Browsing demo only. This button does not
                  place an order or process a payment.
                </Text>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#694F2E',
  },
  container: {
    flex: 1,
    backgroundColor: '#694F2E',
  },
  hero: {
    backgroundColor: '#694F2E',
    paddingHorizontal: 22,
    paddingTop: 25,
    paddingBottom: 27,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },
  heroTextWrap: {
    flex: 1,
  },
  eyebrow: {
    color: '#C9AD8A',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.8,
    marginBottom: 9,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
  },
  heroSubtitle: {
    color: '#F7F0E6',
    fontSize: 12,
    marginTop: 9,
    lineHeight: 18,
  },
  heroIcon: {
    width: 75,
    height: 75,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.13)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 17,
    paddingBottom: 28,
  },
  searchBox: {
    height: 49,
    borderRadius: 14,
    backgroundColor: '#F7F0E6',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#C9AD8A',
  },
  searchInput: {
    flex: 1,
    marginLeft: 9,
    color: '#352719',
    fontSize: 13,
    paddingVertical: 10,
  },
  sectionHeading: {
    marginTop: 24,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#F0E4D4',
    marginTop: 4,
  },
  categoryList: {
    gap: 8,
    paddingBottom: 3,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: '#C9AD8A',
    borderWidth: 1,
    borderColor: '#C9AD8A',
  },
  categoryChipActive: {
    backgroundColor: '#F7F0E6',
    borderColor: '#F7F0E6',
  },
  categoryText: {
    color: '#352719',
    fontSize: 11,
    fontWeight: '700',
  },
  categoryTextActive: {
    color: '#694F2E',
  },
  productsHeading: {
    marginTop: 23,
    marginBottom: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 13,
  },
  productCard: {
    width: '48.5%',
    backgroundColor: '#C9AD8A',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#DCC6A9',
  },
  productImageWrap: {
    height: 137,
    backgroundColor: '#E8DCCB',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  productTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#F7F0E6',
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  productTagText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#694F2E',
  },
  productInfo: {
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  productCategory: {
    color: '#594735',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  productName: {
    color: '#352719',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    marginTop: 5,
    minHeight: 34,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 6,
  },
  ratingText: {
    fontSize: 10,
    color: '#594735',
    fontWeight: '700',
  },
  productPrice: {
    fontSize: 16,
    color: '#694F2E',
    fontWeight: '900',
    marginTop: 7,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 9,
    paddingTop: 11,
    paddingBottom: 10,
  },
  detailsButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F0E6',
    borderRadius: 9,
    paddingVertical: 9,
  },
  detailsButtonText: {
    color: '#694F2E',
    fontSize: 10,
    fontWeight: '900',
  },
  heartButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#F7F0E6',
  },
  heartButtonActive: {
    backgroundColor: '#E8C9C2',
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#C9AD8A',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DCC6A9',
    padding: 28,
    marginTop: 8,
  },
  emptyTitle: {
    color: '#352719',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 12,
  },
  emptySubtitle: {
    color: '#594735',
    fontSize: 12,
    marginTop: 6,
  },
  resetButton: {
    backgroundColor: '#694F2E',
    paddingHorizontal: 17,
    paddingVertical: 11,
    borderRadius: 10,
    marginTop: 15,
  },
  resetButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginTop: 23,
    padding: 13,
    borderRadius: 13,
    backgroundColor: '#C9AD8A',
  },
  disclaimerText: {
    flex: 1,
    color: '#352719',
    fontSize: 10,
    lineHeight: 16,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(53, 39, 25, 0.65)',
  },
  modalCard: {
    maxHeight: '90%',
    backgroundColor: '#F7F0E6',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 10,
    overflow: 'hidden',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 4,
    backgroundColor: '#C9AD8A',
    marginBottom: 10,
  },
  modalContent: {
    paddingHorizontal: 18,
    paddingBottom: 30,
  },
  modalImageWrap: {
    height: 235,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#C9AD8A',
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },
  modalClose: {
    position: 'absolute',
    top: 11,
    right: 11,
    width: 39,
    height: 39,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F0E6',
  },
  modalCategory: {
    color: '#694F2E',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginTop: 19,
  },
  modalTitle: {
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '900',
    color: '#352719',
    marginTop: 6,
  },
  modalRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 9,
  },
  modalRating: {
    color: '#352719',
    fontSize: 12,
    fontWeight: '800',
  },
  modalRatingNote: {
    color: '#6E573F',
    fontSize: 11,
  },
  modalPrice: {
    color: '#694F2E',
    fontSize: 26,
    fontWeight: '900',
    marginTop: 13,
  },
  descriptionHeading: {
    color: '#352719',
    fontSize: 14,
    fontWeight: '900',
    marginTop: 20,
  },
  descriptionText: {
    color: '#594735',
    fontSize: 12,
    lineHeight: 20,
    marginTop: 7,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#C9AD8A',
    borderRadius: 14,
    padding: 12,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#DCC6A9',
  },
  sellerIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: '#F7F0E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerInfo: {
    marginLeft: 11,
  },
  sellerLabel: {
    fontSize: 10,
    color: '#594735',
  },
  sellerName: {
    color: '#352719',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 3,
  },
  buyButton: {
    minHeight: 50,
    backgroundColor: '#694F2E',
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 20,
  },
  buyButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  staticNote: {
    textAlign: 'center',
    color: '#6E573F',
    fontSize: 10,
    lineHeight: 16,
    marginTop: 9,
  },
});
