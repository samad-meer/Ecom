import { colors } from '../theme';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IS_MAPS_CONFIGURED } from '../constants/mapsConfig';
import { formatPin } from '../services/addressService';
import type { AddressPinMapProps } from './AddressPinMapInner';

/**
 * Draws the delivery pin on a map when this build has a Maps key, and an
 * honest placeholder when it does not.
 *
 * The `require` is deliberate and must not become a static import: evaluating
 * react-native-maps mounts the native Maps SDK, which with an empty key draws a
 * grey square and logs an authorization failure nobody sees. Guarding the
 * require means the module is never evaluated at all, so there is nothing to
 * fail. Same trick as RiderMapView.
 *
 * The placeholder still reports the coordinates, because Use Current Location
 * works with or without a Maps key — losing the map costs the customer the
 * ability to fine-tune by hand, not the ability to attach a pin at all.
 */
const Inner: React.ComponentType<AddressPinMapProps> | null = IS_MAPS_CONFIGURED
  ? require('./AddressPinMapInner').default
  : null;

export type { AddressPinMapProps } from './AddressPinMapInner';

export const AddressPinMap: React.FC<AddressPinMapProps> = (props) => {
  if (!Inner) {
    return (
      <View style={[styles.placeholder, props.style]}>
        <Ionicons name="map-outline" size={36} color={colors.muted} />
        <Text style={styles.title}>Map not available in this build</Text>
        <Text style={styles.body}>
          {props.pin
            ? `Your saved pin (${formatPin(props.pin)}) still goes to the rider — it just cannot be shown here.`
            : 'Use Current Location below to attach a delivery pin. Dragging one by hand needs a Maps key.'}
        </Text>
      </View>
    );
  }
  return <Inner {...props} />;
};

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
    backgroundColor: '#f4f5f7',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  title: { fontSize: 14, fontWeight: '600', color: colors.muted },
  body: { fontSize: 12, color: '#a3a3a3', textAlign: 'center', lineHeight: 18 },
});
