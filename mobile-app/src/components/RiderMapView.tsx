import { colors } from '../theme';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IS_MAPS_CONFIGURED } from '../constants/mapsConfig';
import type { RiderMapViewProps } from './RiderMapViewInner';

/**
 * Renders a map when this build has a Maps key, and an honest placeholder when
 * it does not.
 *
 * The `require` is deliberate and must not become a static import: evaluating
 * react-native-maps mounts the native Maps SDK, which with an empty key draws a
 * grey square and logs an authorization failure nobody sees. Guarding the
 * require means the module is never evaluated at all, so there is nothing to
 * fail. Same trick as GoogleSignInButton's outer wrapper.
 */
const Inner: React.ComponentType<RiderMapViewProps> | null = IS_MAPS_CONFIGURED
  ? require('./RiderMapViewInner').default
  : null;

export type { RiderMapMarker, RiderMapViewProps } from './RiderMapViewInner';

export const RiderMapView: React.FC<RiderMapViewProps> = (props) => {
  if (!Inner) {
    return (
      <View style={[styles.placeholder, props.style]}>
        <Ionicons name="map-outline" size={48} color={colors.muted} />
        <Text style={styles.title}>Map key not configured</Text>
        <Text style={styles.body}>
          Add GOOGLE_MAPS_API_KEY to mobile-app/.env and rebuild the app. Rider positions are still
          listed in full under the List tab.
        </Text>
      </View>
    );
  }
  return <Inner {...props} />;
};

const styles = StyleSheet.create({
  placeholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 10, padding: 32, backgroundColor: colors.bg,
  },
  title: { fontSize: 15, fontWeight: '600', color: colors.muted },
  body: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 19 },
});
