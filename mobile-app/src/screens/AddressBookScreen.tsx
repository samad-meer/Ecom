import { colors, radius, card, pagePadding } from '../theme';
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { AddressFormSheet } from '../components/AddressFormSheet';
import { ErrorState, EmptyState, StatusPill, friendlyError } from '../components/ui';
import { CustomerAddress, addressService, formatPin, pinOf } from '../services/addressService';

/**
 * The customer's address book, reachable from Profile.
 *
 * Checkout can add an address mid-order, but managing them — renaming,
 * fixing a pin, deleting the flat they moved out of, choosing which one
 * checkout pre-selects — deserves somewhere that is not the middle of a
 * purchase.
 */

/** Icon per address label, matching the checkout picker. */
const LABEL_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  home: 'home',
  office: 'business',
  shop: 'storefront',
  warehouse: 'cube',
  other: 'location',
};

export const AddressBookScreen: React.FC = () => {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Id currently being promoted or deleted — disables just that row. */
  const [busyId, setBusyId] = useState<number | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CustomerAddress | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    try {
      setAddresses(await addressService.list());
    } catch (error: any) {
      // Keeping whatever was already on screen; an empty list here would read
      // as "you have no addresses", which is a very different message.
      setLoadError(error?.message || 'Could not load your addresses.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Re-read on focus: an address added during checkout should be here when the
  // customer comes back, and this screen stays mounted inside the stack.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleSetDefault = async (address: CustomerAddress) => {
    setBusyId(address.id);
    try {
      await addressService.setDefault(address.id);
      // The server demotes the previous default, so re-read rather than
      // guessing which one lost it.
      await load('refresh');
    } catch (error: any) {
      Alert.alert('Could not set default', friendlyError(error?.message));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = (address: CustomerAddress) => {
    Alert.alert(
      'Delete address',
      `Remove “${address.display_label}” from your address book?\n\n`
      + 'Orders already placed to it keep their own copy of the address.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusyId(address.id);
            try {
              await addressService.remove(address.id);
              setAddresses(prev => prev.filter(a => a.id !== address.id));
            } catch (error: any) {
              Alert.alert('Could not delete', friendlyError(error?.message));
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  const handleSaved = () => {
    setShowForm(false);
    setEditing(null);
    // A save can move the default around, so take the list from the server
    // rather than splicing the returned row into a list that may now be wrong.
    load('refresh');
  };

  const openNew = () => {
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (address: CustomerAddress) => {
    setEditing(address);
    setShowForm(true);
  };

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.centreText}>Loading your addresses…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load('refresh')}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* A failed refresh keeps the cards below and says why they may be old. */}
        {!!loadError && addresses.length > 0 && (
          <View style={styles.errorBox}>
            <Ionicons name="cloud-offline-outline" size={18} color={colors.danger} />
            <View style={styles.flex}>
              <Text style={styles.errorText}>{friendlyError(loadError)}</Text>
              <TouchableOpacity onPress={() => load('refresh')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.errorLink}>Try again</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Nothing to show and the cause is a failed request: do not claim the
            customer has no addresses. */}
        {!!loadError && addresses.length === 0 && (
          <ErrorState
            title="Could not load your addresses"
            message={loadError}
            onRetry={() => load()}
          />
        )}

        {addresses.length === 0 && !loadError && (
          <EmptyState
            icon="location-outline"
            title="No saved addresses"
            text="Add the places you want water delivered to. The first one you save becomes your default, and checkout picks it automatically."
          />
        )}

        {addresses.map(address => {
          const pin = pinOf(address);
          const busy = busyId === address.id;
          return (
            <View key={address.id} style={[styles.card, address.is_default && styles.cardDefault]}>
              <View style={styles.cardHead}>
                <View style={styles.iconWrap}>
                  <Ionicons
                    name={LABEL_ICONS[address.label] ?? 'location'}
                    size={20}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.flex}>
                  <View style={styles.titleRow}>
                    <Text style={styles.cardTitle}>{address.display_label}</Text>
                    {address.is_default && <StatusPill label="Default" tone="primary" />}
                  </View>
                  <Text style={styles.cardAddress}>{address.address}</Text>
                  <View style={styles.pinRow}>
                    <Ionicons
                      name={pin ? 'navigate-circle' : 'navigate-circle-outline'}
                      size={15}
                      color={pin ? colors.success : colors.muted}
                    />
                    <Text style={styles.cardPin}>
                      {pin ? `Pin: ${formatPin(pin)}` : 'No map pin saved'}
                    </Text>
                  </View>
                </View>
                {busy && <ActivityIndicator size="small" color={colors.primary} />}
              </View>

              <View style={styles.cardActions}>
                {!address.is_default && (
                  <TouchableOpacity
                    style={[styles.action, busy && styles.actionBusy]}
                    onPress={() => handleSetDefault(address)}
                    disabled={busy}
                  >
                    <Ionicons name="star-outline" size={16} color={colors.primary} />
                    <Text style={styles.actionText}>Set default</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.action, busy && styles.actionBusy]}
                  onPress={() => openEdit(address)}
                  disabled={busy}
                >
                  <Ionicons name="create-outline" size={16} color={colors.primary} />
                  <Text style={styles.actionText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.action, styles.actionDanger, busy && styles.actionBusy]}
                  onPress={() => handleDelete(address)}
                  disabled={busy}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  <Text style={[styles.actionText, styles.actionTextDanger]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <TouchableOpacity style={styles.addButton} onPress={openNew}>
        <Ionicons name="add" size={22} color={colors.white} />
        <Text style={styles.addButtonText}>Add new address</Text>
      </TouchableOpacity>

      <AddressFormSheet
        visible={showForm}
        address={editing}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
        }}
        onSaved={handleSaved}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.bg },
  centreText: { fontSize: 14, color: colors.muted },
  list: { paddingHorizontal: pagePadding, paddingTop: pagePadding, paddingBottom: 24, flexGrow: 1 },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerLine,
    marginBottom: 12,
  },
  errorText: { fontSize: 14, color: colors.danger, lineHeight: 20 },
  errorLink: { fontSize: 14, fontWeight: '800', color: colors.primaryDark, marginTop: 6 },

  card: {
    ...card,
    padding: 16,
    marginBottom: 12,
  },
  cardDefault: { borderColor: colors.primary, borderWidth: 1.5 },
  cardHead: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  cardAddress: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginTop: 4 },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  cardPin: { fontSize: 12, color: colors.muted, fontVariant: ['tabular-nums'], flexShrink: 1 },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceTint,
  },
  actionDanger: { backgroundColor: colors.dangerBg, borderColor: colors.dangerLine },
  actionBusy: { opacity: 0.55 },
  actionText: { fontSize: 14, fontWeight: '800', color: colors.primaryDark },
  actionTextDanger: { color: colors.danger },

  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    marginHorizontal: pagePadding,
    marginBottom: pagePadding,
    height: 54,
    borderRadius: radius.md,
  },
  addButtonText: { color: colors.white, fontSize: 16, fontWeight: '800' },
});
