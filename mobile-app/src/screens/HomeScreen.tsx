import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TextInput, RefreshControl, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useProducts } from '../hooks/useProducts';
import { ProductCard } from '../components/ProductCard';
import { LoadingScreen } from '../components/LoadingScreen';
import { Product, Category } from '../types/product';
import { RootStackParamList } from '../types/navigation';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../context/LanguageContext';

export const HomeScreen: React.FC = () => {
  const { products, categories, selectedCategory, setSelectedCategory, loading, error, refetch } = useProducts();
  const [searchQuery, setSearchQuery] = useState('');
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t } = useLanguage();

  const filteredProducts = products.filter(product =>  
    product.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleProductPress = (product: Product) => {
    navigation.navigate('ProductDetail', { product });
  };

  const renderProduct = ({ item }: { item: Product }) => (
    <ProductCard product={item} onPress={handleProductPress} />
  );

  const renderCategory = ({ item }: { item: Category }) => {
     const isSelected = selectedCategory === item.id;
     return (
       <TouchableOpacity 
         style={[styles.categoryChip, isSelected && styles.selectedCategoryChip]}
         onPress={() => setSelectedCategory(isSelected ? undefined : item.id)}
       >
         {item.icon && <Ionicons name={item.icon as any} size={16} color={isSelected ? '#fff' : '#333'} style={{marginRight: 4}} />}
         <Text style={[styles.categoryText, isSelected && styles.selectedCategoryText]}>{item.name}</Text>
       </TouchableOpacity>
     );
  };

  if (loading && products.length === 0) {
    return <LoadingScreen message="Loading products…" />;
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.retryText} onPress={refetch}>{t('tap_retry', 'Tap to retry')}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>{t('latest_products', 'Latest Products')}</Text>
      </View>
      
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={t('search_placeholder', 'Search products...')}
          placeholderTextColor="#000"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View style={styles.categoriesContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesContent}>
           <TouchableOpacity 
             style={[styles.categoryChip, selectedCategory === undefined && styles.selectedCategoryChip]}
             onPress={() => setSelectedCategory(undefined)}
           >
             <Text style={[styles.categoryText, selectedCategory === undefined && styles.selectedCategoryText]}>{t('category_all', 'All')}</Text>
           </TouchableOpacity>
           {categories.map(cat => (
             <TouchableOpacity 
               key={cat.id}
               style={[styles.categoryChip, selectedCategory === cat.id && styles.selectedCategoryChip]}
               onPress={() => setSelectedCategory(selectedCategory === cat.id ? undefined : cat.id)}
             >
               <Ionicons name={cat.icon as any || 'pricetag'} size={16} color={selectedCategory === cat.id ? '#fff' : '#333'} style={{marginRight: 4}} />
               <Text style={[styles.categoryText, selectedCategory === cat.id && styles.selectedCategoryText]}>{t(`category_${cat.slug}`, cat.name)}</Text>
             </TouchableOpacity>
           ))}
        </ScrollView>
      </View>

      <FlatList
        data={filteredProducts}
        renderItem={renderProduct}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.centerContainer}>
            <Text>{t('no_products_found', 'No products found.')}</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: 10,
  },
  headerContainer: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  searchInput: {
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
    color: '#000',
  },
  categoriesContainer: {
    marginBottom: 10,
  },
  categoriesContent: {
    paddingHorizontal: 16,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  selectedCategoryChip: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  categoryText: {
    fontSize: 14,
    color: '#333',
  },
  selectedCategoryText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  listContent: {
    paddingHorizontal: 8,
    paddingBottom: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    marginBottom: 10,
  },
  retryText: {
    color: 'blue',
    textDecorationLine: 'underline',
  },
});
