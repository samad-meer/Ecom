import { colors } from '../theme';
import React, { useEffect, useRef } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import MapView, { LatLng, Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { FALLBACK_REGION } from '../constants/mapsConfig';

/**
 * The only module in the app that touches react-native-maps. RiderMapView
 * requires it lazily so the Maps SDK is never initialized in a build that has
 * no API key — see the comment there.
 */

export interface RiderMapMarker {
  /** Django user id, so it lines up with the trail endpoint. */
  id: number;
  latitude: number;
  longitude: number;
  title: string;
  description: string;
  color: string;
}

export interface RiderMapViewProps {
  markers: RiderMapMarker[];
  /** Chronological path for the selected rider; empty draws no line. */
  trail?: LatLng[];
  selectedId?: number | null;
  onSelectRider?: (riderId: number) => void;
  onDeselect?: () => void;
  /**
   * False turns the map into a still preview. Order screens are ScrollViews, and
   * a pannable map inside one steals every vertical drag from the page.
   */
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Bounding box around every pin, or Lahore when there is nothing to show. */
const regionFor = (points: LatLng[]): Region => {
  if (points.length === 0) return FALLBACK_REGION;

  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    // A lone rider spans zero degrees, which would zoom to rooftop level and
    // lose all sense of where in the city they are.
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.02),
    longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.02),
  };
};

const RiderMapViewInner: React.FC<RiderMapViewProps> = ({
  markers,
  trail = [],
  selectedId = null,
  onSelectRider,
  onDeselect,
  interactive = true,
  style,
}) => {
  const mapRef = useRef<MapView | null>(null);
  const hasFitted = useRef(false);

  // Fit once, when riders first arrive. Re-fitting on every 20s poll would
  // yank the camera back while the admin is panning around.
  useEffect(() => {
    if (hasFitted.current || markers.length === 0) return;
    hasFitted.current = true;
    mapRef.current?.animateToRegion(regionFor(markers), 400);
  }, [markers]);

  useEffect(() => {
    if (selectedId == null) return;
    const target = markers.find((m) => m.id === selectedId);
    if (target) {
      mapRef.current?.animateToRegion(
        { latitude: target.latitude, longitude: target.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        400,
      );
    }
    // Only when the selection changes — following a moving pin every poll
    // would make the map impossible to read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_GOOGLE}
      style={style}
      initialRegion={regionFor(markers)}
      onPress={onDeselect}
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      rotateEnabled={interactive}
      pitchEnabled={interactive}
      toolbarEnabled={false}
      showsMyLocationButton={false}
    >
      {trail.length > 1 && (
        <Polyline coordinates={trail} strokeColor={colors.primary} strokeWidth={4} />
      )}

      {markers.map((marker) => (
        <Marker
          key={marker.id}
          identifier={String(marker.id)}
          coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
          title={marker.title}
          description={marker.description}
          pinColor={marker.color}
          onPress={() => onSelectRider?.(marker.id)}
        />
      ))}
    </MapView>
  );
};

export default RiderMapViewInner;
