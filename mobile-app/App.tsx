import { colors, radius, shadow } from './src/theme';
import React, { useContext } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
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
import { AdminPaymentClaimsScreen } from './src/screens/admin/AdminPaymentClaimsScreen';

import { RootStackParamList, MainTabParamList, AdminTabParamList } from './src/types/navigation';
import { CartProvider, useCart } from './src/context/CartContext';
import { AuthProvider, AuthContext } from './src/context/AuthContext';
import { LanguageProvider } from './src/context/LanguageContext';
import { FloatingContactButton } from './src/components/FloatingContactButton';
import { RiderLocationGate } from './src/components/RiderLocationGate';
import { DialogProvider } from './src/components/AppDialog';
import { AdminHeader } from './src/components/AdminHeader';
import { BrandProvider, useBrand } from './src/context/BrandContext';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const AdminTab = createBottomTabNavigator<AdminTabParamList>();

// ─── Brand constants ──────────────────────────────────────────────────────────

const BRAND_BLUE = colors.primary;
const BRAND_DARK = colors.ink;

// ─── Brand logo title ─────────────────────────────────────────────────────────

/** Splits a name so its last word can take the brand colour ("Century" + "Sip"). */
const splitBrand = (name: string): [string, string] => {
  const i = name.trim().lastIndexOf(' ');
  return i === -1 ? [name.trim(), ''] : [name.slice(0, i), name.slice(i)];
};

const BrandTitle = ({ roleLabel }: { roleLabel?: string }) => {
  const { name } = useBrand();
  const [head, tail] = splitBrand(name);
  return (
    <View style={brand.titleRow}>
      <View style={brand.iconWrap}>
        <Ionicons name="water" size={15} color="#fff" />
      </View>
      <Text style={brand.titleText} numberOfLines={1}>
        {head}<Text style={{ color: BRAND_BLUE }}>{tail}</Text>
      </Text>
      {roleLabel ? (
        <View style={brand.roleBadge}>
          <Text style={brand.roleText}>{roleLabel}</Text>
        </View>
      ) : null}
    </View>
  );
};

const brand = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  iconWrap: {
    width: 30, height: 30, borderRadius: 12,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center', alignItems: 'center',
  },
  titleText: { fontSize: 18, fontWeight: '800', color: BRAND_DARK },
  // The sunny accent: a rider or admin sees at a glance which role they are in.
  roleBadge: {
    backgroundColor: colors.sun, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 3, marginLeft: 4,
  },
  roleText: { fontSize: 12, fontWeight: '800', color: colors.ink, textTransform: 'uppercase', letterSpacing: 0.5 },
});

// ─── Shared header options ────────────────────────────────────────────────────

const headerOptions = (roleLabel?: string) => ({
  headerStyle: { backgroundColor: colors.bg } as any,
  headerShadowVisible: false,
  headerTintColor: BRAND_BLUE,
  headerTitle: () => <BrandTitle roleLabel={roleLabel} />,
});

// ─── Cart icon ────────────────────────────────────────────────────────────────

const HeaderRight = ({ navigation }: { navigation: any }) => {
  const { getCartCount } = useCart();
  const count = getCartCount();
  return (
    <TouchableOpacity onPress={() => navigation.navigate('Cart')} style={styles.cartButton} accessibilityLabel="Open cart">
      <Ionicons name="cart-outline" size={22} color={colors.ink} />
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// ─── Splash loading screen ────────────────────────────────────────────────────

const SplashScreen = () => {
  const { name } = useBrand();
  const [head, tail] = splitBrand(name);
  return (
    <SafeAreaProvider>
      <View style={styles.splash}>
        <View style={styles.splashLogoWrap}>
          <Ionicons name="water" size={56} color={colors.primary} />
        </View>
        <Text style={styles.splashTitle} numberOfLines={1} adjustsFontSizeToFit>
          {head}<Text style={{ color: colors.sun }}>{tail}</Text>
        </Text>
        <Text style={styles.splashTagline}>Pure water. Fast delivery.</Text>
        <ActivityIndicator color={colors.white} size="large" style={{ marginTop: 48 }} />
      </View>
    </SafeAreaProvider>
  );
};

// ─── Floating tab bar ─────────────────────────────────────────────────────────
// A navy pill that floats above the page. The tab you are on becomes a sunny
// yellow pill with its name; the others are crisp icons. With five tabs
// (admin) there is no room for names, so the active tab is a clean circular
// yellow badge with a bold, high-contrast icon.

type IconPair = [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap];

const TabPill = ({ icon, label, focused, showLabel }: {
  icon: IconPair; label: string; focused: boolean; showLabel: boolean;
}) => (
  <View
    style={[
      showLabel ? tabStyles.itemWithLabel : tabStyles.itemIconOnly,
      focused && (showLabel ? tabStyles.itemActiveWithLabel : tabStyles.itemActiveIconOnly),
    ]}
    accessibilityLabel={label}
  >
    <Ionicons
      name={focused ? icon[0] : icon[1]}
      size={24}
      color={focused ? colors.ink : 'rgba(255, 255, 255, 0.75)'}
    />
    {focused && showLabel ? <Text style={tabStyles.label} numberOfLines={1}>{label}</Text> : null}
  </View>
);

/** Bar style shared by both tab sets. The bar sits in the layout (not on top of
 *  it), so no screen needs extra bottom padding to stay clear of it. */
const useFloatingTabBar = () => {
  const insets = useSafeAreaInsets();
  return {
    backgroundColor: colors.ink,
    borderTopWidth: 0,
    height: 64,
    paddingTop: 0,
    paddingBottom: 0,
    marginTop: 8,
    marginHorizontal: 18,
    marginBottom: Math.max(insets.bottom, 12),
    borderRadius: 32,
    ...shadow.float,
  } as const;
};

const tabStyles = StyleSheet.create({
  itemWithLabel: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 44, minWidth: 44, paddingHorizontal: 12, borderRadius: radius.pill, gap: 6,
  },
  itemActiveWithLabel: { backgroundColor: colors.sun, paddingHorizontal: 16 },
  itemIconOnly: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  itemActiveIconOnly: {
    backgroundColor: colors.sun,
    ...shadow.card,
  },
  label: { color: colors.ink, fontSize: 13, fontWeight: '800' },
});

// ─── Customer / Rider tabs ────────────────────────────────────────────────────

const MainTabs = () => {
  const { user } = useContext(AuthContext);
  const isDeliveryBoy = user?.user_type === 'delivery_boy';
  const roleLabel = isDeliveryBoy ? 'Rider' : undefined;
  const tabBarStyle = useFloatingTabBar();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => {
          let icon: IconPair = ['home', 'home-outline'];
          let label = 'Home';
          if (route.name === 'Home') { icon = ['storefront', 'storefront-outline']; label = 'Shop'; }
          else if (route.name === 'Orders') {
            icon = isDeliveryBoy ? ['bicycle', 'bicycle-outline'] : ['receipt', 'receipt-outline'];
            label = isDeliveryBoy ? 'Deliveries' : 'Orders';
          } else if (route.name === 'RiderPayment') { icon = ['qr-code', 'qr-code-outline']; label = 'Pay'; }
          else if (route.name === 'Profile') { icon = ['person-circle', 'person-circle-outline']; label = 'Profile'; }
          return <TabPill icon={icon} label={label} focused={focused} showLabel />;
        },
        tabBarShowLabel: false,
        tabBarLabelPosition: 'beside-icon',
        tabBarStyle,
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
        options={{ tabBarLabel: 'Profile', headerShown: false }}
      />
    </Tab.Navigator>
  );
};

// ─── Admin tabs ───────────────────────────────────────────────────────────────

const AdminTabs = () => {
  const tabBarStyle = useFloatingTabBar();
  return (
  <AdminTab.Navigator
    screenOptions={({ route }) => ({
      tabBarIcon: ({ focused }) => {
        const icons: Record<string, [IconPair, string]> = {
          Dashboard:      [['stats-chart', 'stats-chart-outline'], 'Dashboard'],
          AdminOrders:    [['receipt', 'receipt-outline'], 'Orders'],
          AdminCustomers: [['people', 'people-outline'], 'Customers'],
          AdminManage:    [['construct', 'construct-outline'], 'Manage'],
          Profile:        [['person-circle', 'person-circle-outline'], 'Profile'],
        };
        const [icon, label] = icons[route.name] || [['ellipse', 'ellipse-outline'] as IconPair, route.name];
        return <TabPill icon={icon} label={label} focused={focused} showLabel={false} />;
      },
      tabBarShowLabel: false,
      tabBarLabelPosition: 'beside-icon',
      tabBarStyle,
      ...headerOptions('Admin'),
      header: ({ navigation }) => <AdminHeader navigation={navigation} />,
    })}
  >
    <AdminTab.Screen name="Dashboard"      component={AdminDashboardScreen}  options={{ tabBarLabel: 'Dashboard' }} />
    <AdminTab.Screen name="AdminOrders"    component={AdminOrdersScreen}     options={{ tabBarLabel: 'Orders' }} />
    <AdminTab.Screen name="AdminCustomers" component={AdminCustomersScreen}  options={{ tabBarLabel: 'Customers' }} />
    <AdminTab.Screen name="AdminManage"    component={AdminManageScreen}     options={{ tabBarLabel: 'Manage' }} />
    <AdminTab.Screen name="Profile"        component={ProfileScreen}         options={{ tabBarLabel: 'Profile', headerShown: false }} />
  </AdminTab.Navigator>
  );
};

// ─── App content ──────────────────────────────────────────────────────────────

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.bg,
    card: colors.bg,
    text: colors.ink,
    border: colors.line,
    notification: colors.danger,
  },
};

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
    <NavigationContainer theme={navTheme}>
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
                <Stack.Screen name="AdminPaymentClaims" component={AdminPaymentClaimsScreen} options={{ headerTitle: 'Payments to check' }} />
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
        <BrandProvider>
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
        </BrandProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  // Cart: a white rounded square, like the bell and cart buttons on the tiles
  cartButton: {
    marginRight: 14, width: 42, height: 42, borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  badge: {
    position: 'absolute', right: -5, top: -5,
    backgroundColor: colors.danger, borderRadius: 12,
    minWidth: 18, height: 18,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  // Splash
  splash: {
    flex: 1, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  splashLogoWrap: {
    width: 100, height: 100, borderRadius: radius.xl,
    backgroundColor: colors.white,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 20,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 12,
  },
  splashTitle: {
    fontSize: 36, fontWeight: '900', color: '#fff', letterSpacing: -0.5,
  },
  splashTagline: {
    fontSize: 15, color: 'rgba(255,255,255,0.85)', marginTop: 8, letterSpacing: 0.3,
  },
});
