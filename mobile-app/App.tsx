import React, { useContext } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TouchableOpacity, Text, StyleSheet, View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// Customer / shared screens
import { HomeScreen } from './src/screens/HomeScreen';
import { ProductDetailScreen } from './src/screens/ProductDetailScreen';
import { CartScreen } from './src/screens/CartScreen';
import { CheckoutScreen } from './src/screens/CheckoutScreen';
import { AddressBookScreen } from './src/screens/AddressBookScreen';
import { OrderHistoryScreen } from './src/screens/OrderHistoryScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { RiderPaymentScreen } from './src/screens/RiderPaymentScreen';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { ComplaintScreen } from './src/screens/ComplaintScreen';
import { OrderSuccessScreen } from './src/screens/OrderSuccessScreen';
import { DeliveryOrderDetailScreen } from './src/screens/DeliveryOrderDetailScreen';
import LoginScreen from './src/screens/auth/LoginScreen';
import RegisterScreen from './src/screens/auth/RegisterScreen';

// Admin screens
import { AdminDashboardScreen } from './src/screens/admin/AdminDashboardScreen';
import { AdminOrdersScreen } from './src/screens/admin/AdminOrdersScreen';
import { AdminOrderDetailScreen } from './src/screens/admin/AdminOrderDetailScreen';
import { AdminCreateOrderScreen } from './src/screens/admin/AdminCreateOrderScreen';
import { AdminCustomersScreen } from './src/screens/admin/AdminCustomersScreen';
import { AdminManageScreen } from './src/screens/admin/AdminManageScreen';
import { AdminStaffScreen } from './src/screens/admin/AdminStaffScreen';
import { AdminSettingsScreen } from './src/screens/admin/AdminSettingsScreen';
import { AdminActivityScreen } from './src/screens/admin/AdminActivityScreen';
import { AdminNotificationScreen } from './src/screens/admin/AdminNotificationScreen';
import { AdminPlantScreen } from './src/screens/admin/AdminPlantScreen';
import { AdminLedgerScreen } from './src/screens/admin/AdminLedgerScreen';
import { AdminShopScreen } from './src/screens/admin/AdminShopScreen';
import { AdminRiderMapScreen } from './src/screens/admin/AdminRiderMapScreen';

import { RootStackParamList, MainTabParamList, AdminTabParamList } from './src/types/navigation';
import { CartProvider, useCart } from './src/context/CartContext';
import { AuthProvider, AuthContext } from './src/context/AuthContext';
import { LanguageProvider } from './src/context/LanguageContext';
import { FloatingContactButton } from './src/components/FloatingContactButton';
import { RiderLocationGate } from './src/components/RiderLocationGate';
import { DialogProvider } from './src/components/AppDialog';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const AdminTab = createBottomTabNavigator<AdminTabParamList>();

// ─── Brand constants ──────────────────────────────────────────────────────────

const BRAND_BLUE = '#0A84FF';
const BRAND_DARK = '#0D1B2A';

// ─── Brand logo title ─────────────────────────────────────────────────────────

const BrandTitle = ({ roleLabel }: { roleLabel?: string }) => (
  <View style={brand.titleRow}>
    <View style={brand.iconWrap}>
      <Ionicons name="water" size={15} color="#fff" />
    </View>
    <Text style={brand.titleText}>
      Century<Text style={{ color: BRAND_BLUE }}> Sip</Text>
    </Text>
    {roleLabel ? (
      <View style={brand.roleBadge}>
        <Text style={brand.roleText}>{roleLabel}</Text>
      </View>
    ) : null}
  </View>
);

const brand = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  iconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center', alignItems: 'center',
  },
  titleText: { fontSize: 18, fontWeight: '800', color: BRAND_DARK },
  roleBadge: {
    backgroundColor: '#E8F4FF', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2, marginLeft: 4,
  },
  roleText: { fontSize: 11, fontWeight: '700', color: BRAND_BLUE, textTransform: 'uppercase', letterSpacing: 0.5 },
});

// ─── Shared header options ────────────────────────────────────────────────────

const headerOptions = (roleLabel?: string) => ({
  headerStyle: { backgroundColor: '#fff' } as any,
  headerShadowVisible: true,
  headerTintColor: BRAND_BLUE,
  headerTitle: () => <BrandTitle roleLabel={roleLabel} />,
});

// ─── Cart icon ────────────────────────────────────────────────────────────────

const HeaderRight = ({ navigation }: { navigation: any }) => {
  const { getCartCount } = useCart();
  const count = getCartCount();
  return (
    <TouchableOpacity onPress={() => navigation.navigate('Cart')} style={styles.cartButton}>
      <Ionicons name="cart-outline" size={24} color={BRAND_BLUE} />
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// ─── Splash loading screen ────────────────────────────────────────────────────

const SplashScreen = () => (
  <SafeAreaProvider>
    <View style={styles.splash}>
      <View style={styles.splashLogoWrap}>
        <Ionicons name="water" size={56} color="#fff" />
      </View>
      <Text style={styles.splashTitle}>
        Century<Text style={{ color: '#90CAFF' }}> Sip</Text>
      </Text>
      <Text style={styles.splashTagline}>Pure water. Fast delivery.</Text>
      <ActivityIndicator color="rgba(255,255,255,0.6)" size="large" style={{ marginTop: 48 }} />
    </View>
  </SafeAreaProvider>
);

// ─── Customer / Rider tabs ────────────────────────────────────────────────────

const MainTabs = () => {
  const { user } = useContext(AuthContext);
  const isDeliveryBoy = user?.user_type === 'delivery_boy';
  const roleLabel = isDeliveryBoy ? 'Rider' : undefined;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';
          if (route.name === 'Home') iconName = focused ? 'storefront' : 'storefront-outline';
          else if (route.name === 'Orders') iconName = focused ? (isDeliveryBoy ? 'bicycle' : 'receipt') : (isDeliveryBoy ? 'bicycle-outline' : 'receipt-outline');
          else if (route.name === 'RiderPayment') iconName = focused ? 'qr-code' : 'qr-code-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person-circle' : 'person-circle-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: BRAND_BLUE,
        tabBarInactiveTintColor: '#aaa',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        ...headerOptions(roleLabel),
      })}
    >
      {!isDeliveryBoy && (
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={({ navigation }) => ({
            tabBarLabel: 'Shop',
            headerRight: () => <HeaderRight navigation={navigation} />,
          })}
        />
      )}
      <Tab.Screen
        name="Orders"
        component={OrderHistoryScreen}
        options={{ tabBarLabel: isDeliveryBoy ? 'Deliveries' : 'Orders' }}
      />
      {/* Riders only. A customer who wants to pay by transfer asks at the door,
          so the account has to be one tap away — not buried behind an order. */}
      {isDeliveryBoy && (
        <Tab.Screen
          name="RiderPayment"
          component={RiderPaymentScreen}
          options={{ tabBarLabel: 'Pay' }}
        />
      )}
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
};

// ─── Admin tabs ───────────────────────────────────────────────────────────────

const AdminTabs = () => (
  <AdminTab.Navigator
    screenOptions={({ route }) => ({
      tabBarIcon: ({ focused, color, size }) => {
        const icons: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
          Dashboard:      ['grid',       'grid-outline'],
          AdminOrders:    ['receipt',    'receipt-outline'],
          AdminCustomers: ['people',     'people-outline'],
          AdminManage:    ['construct',  'construct-outline'],
          Profile:        ['person-circle', 'person-circle-outline'],
        };
        const [active, inactive] = icons[route.name] || ['ellipse', 'ellipse-outline'];
        return <Ionicons name={focused ? active : inactive} size={size} color={color} />;
      },
      tabBarActiveTintColor: BRAND_BLUE,
      tabBarInactiveTintColor: '#aaa',
      tabBarStyle: styles.tabBar,
      tabBarLabelStyle: styles.tabLabel,
      ...headerOptions('Admin'),
    })}
  >
    <AdminTab.Screen name="Dashboard"      component={AdminDashboardScreen}  options={{ tabBarLabel: 'Dashboard' }} />
    <AdminTab.Screen name="AdminOrders"    component={AdminOrdersScreen}     options={{ tabBarLabel: 'Orders' }} />
    <AdminTab.Screen name="AdminCustomers" component={AdminCustomersScreen}  options={{ tabBarLabel: 'Customers' }} />
    <AdminTab.Screen name="AdminManage"    component={AdminManageScreen}     options={{ tabBarLabel: 'Manage' }} />
    <AdminTab.Screen name="Profile"        component={ProfileScreen}         options={{ tabBarLabel: 'Profile' }} />
  </AdminTab.Navigator>
);

// ─── App content ──────────────────────────────────────────────────────────────

const AppContent = () => {
  const { user, isBootstrapping } = useContext(AuthContext);
  const insets = useSafeAreaInsets();
  const isDeliveryBoy = user?.user_type === 'delivery_boy';
  const isAdmin = user?.is_staff === true;

  // Only the initial session restore may swap out the navigator. Showing the
  // splash for an in-flight login/register would unmount the auth screens and
  // discard whatever the user had typed.
  if (isBootstrapping) return <SplashScreen />;

  // android.edgeToEdgeEnabled draws content behind the system navigation bar,
  // so every full-screen route needs the bottom inset or its last row sits
  // under the nav buttons / gesture pill. Applying it once here covers all of
  // them; the tab containers opt out below because their tab bar already
  // reserves that space itself.
  const screenContentStyle = { paddingBottom: insets.bottom };
  const tabHostOptions = {
    headerShown: false,
    contentStyle: { paddingBottom: 0 },
  } as const;

  const tree = (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{ ...headerOptions(), contentStyle: screenContentStyle }}
      >
        {user ? (
          <>
            {isAdmin ? (
              <Stack.Screen name="AdminTabs" component={AdminTabs} options={tabHostOptions} />
            ) : (
              <Stack.Screen name="MainTabs" component={MainTabs} options={tabHostOptions} />
            )}

            {!isDeliveryBoy && !isAdmin && (
              <>
                <Stack.Screen
                  name="ProductDetail"
                  component={ProductDetailScreen}
                  options={({ navigation }) => ({
                    headerTitle: 'Product Details',
                    headerRight: () => <HeaderRight navigation={navigation} />,
                  })}
                />
                <Stack.Screen name="Cart"         component={CartScreen}         options={{ headerTitle: 'My Cart' }} />
                <Stack.Screen name="Checkout"     component={CheckoutScreen}     options={{ headerTitle: 'Checkout' }} />
                {/* Customers only: riders and admins deliver to addresses,
                    they do not keep one of their own. */}
                <Stack.Screen name="AddressBook"  component={AddressBookScreen}  options={{ headerTitle: 'Delivery Addresses' }} />
                <Stack.Screen name="OrderSuccess" component={OrderSuccessScreen} options={{ headerTitle: 'Order Confirmed', headerLeft: () => null }} />
              </>
            )}

            {isDeliveryBoy && (
              <Stack.Screen name="DeliveryOrderDetail" component={DeliveryOrderDetailScreen} options={{ headerTitle: 'Delivery' }} />
            )}

            {isAdmin && (
              <>
                <Stack.Screen name="AdminOrderDetail"   component={AdminOrderDetailScreen}   options={{ headerTitle: 'Order Details' }} />
                <Stack.Screen name="AdminCreateOrder"   component={AdminCreateOrderScreen}   options={{ headerTitle: 'New Order' }} />
                <Stack.Screen name="AdminStaff"         component={AdminStaffScreen}         options={{ headerTitle: 'Staff' }} />
                <Stack.Screen name="AdminSettings"      component={AdminSettingsScreen}      options={{ headerTitle: 'Settings' }} />
                <Stack.Screen name="AdminActivity"      component={AdminActivityScreen}      options={{ headerTitle: 'Activity Log' }} />
                <Stack.Screen name="AdminNotification"  component={AdminNotificationScreen}  options={{ headerTitle: 'Notifications' }} />
                <Stack.Screen name="AdminPlant"         component={AdminPlantScreen}         options={{ headerTitle: 'Plant / Deliveries' }} />
                <Stack.Screen name="AdminLedger"        component={AdminLedgerScreen}        options={{ headerTitle: 'Customer Ledger' }} />
                <Stack.Screen name="AdminShop"          component={AdminShopScreen}          options={{ headerTitle: 'Shop Management' }} />
                <Stack.Screen name="AdminRiderMap"      component={AdminRiderMapScreen}      options={{ headerTitle: 'Live Rider Map' }} />
              </>
            )}

            <Stack.Screen name="Complaints" component={ComplaintScreen} options={{ headerShown: false }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login"    component={LoginScreen}    options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ headerTitle: 'Create Account' }} />
          </>
        )}
      </Stack.Navigator>

      {/* Floats above every customer and rider screen. Admins are the one
          exclusion: they are the people being contacted, and the button would
          sit on top of the dense admin tables. Mounted inside
          NavigationContainer so it can route to the Complaints screen. */}
      {user && !isAdmin && <FloatingContactButton />}
    </NavigationContainer>
  );

  // A rider who is not sharing location cannot work, so the gate stands in
  // front of the whole navigator — there is nothing behind it to reach. It
  // deliberately does not apply to admins, who are not tracked.
  if (isDeliveryBoy && !isAdmin) {
    return <RiderLocationGate>{tree}</RiderLocationGate>;
  }
  return tree;
};

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <LanguageProvider>
            <CartProvider>
              {/* Inside the providers so a dialog can use auth/language, and
                  around AppContent so every screen can raise one. */}
              <DialogProvider>
                <AppContent />
              </DialogProvider>
              <StatusBar style="dark" />
            </CartProvider>
          </LanguageProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  // Tab bar — no fixed height; SafeAreaProvider adds bottom inset automatically
  tabBar: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eef0f3',
    paddingTop: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  tabLabel: { fontSize: 11, fontWeight: '600' },

  // Cart
  cartButton: { marginRight: 14, padding: 4, position: 'relative' },
  badge: {
    position: 'absolute', right: -4, top: -2,
    backgroundColor: '#FF3B30', borderRadius: 9,
    minWidth: 18, height: 18,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  // Splash
  splash: {
    flex: 1, backgroundColor: BRAND_DARK,
    justifyContent: 'center', alignItems: 'center',
  },
  splashLogoWrap: {
    width: 100, height: 100, borderRadius: 28,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 20,
    shadowColor: BRAND_BLUE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  splashTitle: {
    fontSize: 36, fontWeight: '900', color: '#fff', letterSpacing: -0.5,
  },
  splashTagline: {
    fontSize: 15, color: 'rgba(255,255,255,0.5)', marginTop: 8, letterSpacing: 0.3,
  },
});
