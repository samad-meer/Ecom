import { colors } from '../theme';
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RiderMapView } from './RiderMapView';
import { IS_MAPS_CONFIGURED } from '../constants/mapsConfig';
import { formatCoordinates, openDirections, openInMaps, toMapPin } from '../utils/maps';

/**
 * The map pin an order was placed with, plus the two things anyone ever wants to
 * do with it: see where it is, or drive there.
 *
 * The pin is a snapshot taken at checkout, so it stays put even if the customer
 * later edits their address book — that is exactly why it is worth showing.
 *
 * Rendering is gated on IS_MAPS_CONFIGURED here rather than leaning on
 * RiderMapView's own placeholder, because that placeholder tells the reader to
 * check the rider List tab, which means nothing on an order screen. Without a
 * key the coordinates and the deep links still work — only the preview is lost.
 */

interface Props {
  /** Marker identity; the order id keeps it stable across re-renders. */
  orderId: number;
  latitude: string | number | null | undefined;
  longitude: string | number | null | undefined;
  /** Saved-address name the order came from ("Home", "Shop", …); may be empty. */
  label?: string | null;
  /** Riders navigate to the pin; admins only need to look at it. */
  variant?: 'admin' | 'rider';
  style?: StyleProp<ViewStyle>;
}

export const OrderLocationMap: React.FC<Props> = ({
  orderId,
  latitude,
  longitude,
  label,
  variant = 'admin',
  style,
}) => {
  const pinTitle = label?.trim() || `Order #${orderId}`;
  const pin = useMemo(
    () => toMapPin(latitude, longitude, pinTitle),
    [latitude, longitude, pinTitle],
  );

  // Orders placed before pins existed — and call-in orders — legitimately have
  // none, so say so instead of leaving an unexplained gap.
  if (!pin) {
    return (
      <View style={[styles.noPin, style]}>
        <Ionicons name="location-outline" size={16} color={colors.muted} />
        <Text style={styles.noPinText}>No map pin saved with this order</Text>
      </View>
    );
  }

  const isRider = variant === 'rider';

  return (
    <View style={[styles.wrap, style]}>
      {IS_MAPS_CONFIGURED ? (
        <TouchableOpacity activeOpacity={0.85} onPress={() => void openInMaps(pin)}>
          {/* pointerEvents none hands every touch to the wrapper above: the map
              is a preview, and swallowing drags would break the page scroll. */}
          <View style={styles.mapClip} pointerEvents="none">
            <RiderMapView
              interactive={false}
              style={styles.map}
              markers={[{
                id: orderId,
                latitude: pin.latitude,
                longitude: pin.longitude,
                title: pinTitle,
                description: formatCoordinates(pin),
                color: colors.danger,
              }]}
            />
          </View>
          <View style={styles.mapHint}>
            <Ionicons name="expand-outline" size={12} color="#fff" />
            <Text style={styles.mapHintText}>Tap to open</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={styles.noKey}>
          <Ionicons name="map-outline" size={18} color={colors.muted} />
          <Text style={styles.noKeyText}>
            Map preview needs GOOGLE_MAPS_API_KEY in mobile-app/.env. The pin below still opens
            in your maps app.
          </Text>
        </View>
      )}

      <View style={styles.coordRow}>
        <Ionicons name="navigate-circle-outline" size={14} color={colors.muted} />
        <Text style={styles.coordText} selectable>{formatCoordinates(pin)}</Text>
      </View>

      <View style={styles.actions}>
        {isRider && (
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, styles.btnGrow]}
            onPress={() => void openDirections(pin)}
          >
            <Ionicons name="navigate" size={17} color="#fff" />
            <Text style={styles.btnPrimaryText}>Navigate</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.btn, styles.btnGhost, !isRider && styles.btnGrow]}
          onPress={() => void openInMaps(pin)}
        >
          <Ionicons name="map" size={16} color={colors.primary} />
          <Text style={styles.btnGhostText}>Open in Maps</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 10 },

  mapClip: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#e9eef3' },
  map: { height: 170, width: '100%' },
  mapHint: {
    position: 'absolute', right: 8, bottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 16,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  mapHintText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  noKey: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: colors.bg, borderRadius: 14, padding: 12,
  },
  noKeyText: { flex: 1, fontSize: 12, color: colors.muted, lineHeight: 17 },

  noPin: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noPinText: { fontSize: 13, color: colors.muted, fontStyle: 'italic' },

  coordRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coordText: { fontSize: 12.5, color: colors.muted, fontVariant: ['tabular-nums'] },

  actions: { flexDirection: 'row', gap: 10 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14,
  },
  btnGrow: { flex: 1 },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnGhost: { borderWidth: 1, borderColor: colors.primary + '60', backgroundColor: colors.primary + '10' },
  btnGhostText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
});
