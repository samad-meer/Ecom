import { colors } from '../theme';
import React, { useEffect, useRef } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import MapView, { MapPressEvent, Marker, MarkerDragStartEndEvent, PROVIDER_GOOGLE } from 'react-native-maps';
import { FALLBACK_REGION } from '../constants/mapsConfig';
import type { Pin } from '../services/addressService';

/**
 * The delivery-pin map. Like RiderMapViewInner, this is the only place that
 * touches react-native-maps for the customer flow — AddressPinMap requires it
 * lazily so the Maps SDK is never initialized in a build with no API key.
 */

export interface AddressPinMapProps {
  /** Current pin, or null when this address has never had one. */
  pin: Pin | null;
  onChange: (pin: Pin) => void;
  style?: StyleProp<ViewStyle>;
}

/** Tight enough to see individual roofs — the customer is picking a door. */
const PIN_DELTA = 0.004;

const AddressPinMapInner: React.FC<AddressPinMapProps> = ({ pin, onChange, style }) => {
  const mapRef = useRef<MapView | null>(null);
  // The pin the map camera was last moved to. Dragging the marker or tapping
  // the map already leaves the camera where the customer put it, so re-centring
  // on those would fight them; only jumps they did NOT make with their finger
  // (Use Current Location, switching address) are followed.
  const lastCentred = useRef<string | null>(null);

  useEffect(() => {
    if (!pin) return;
    const key = `${pin.latitude},${pin.longitude}`;
    if (lastCentred.current === key) return;
    lastCentred.current = key;
    // animateCamera keeps the customer's zoom level; animateToRegion would
    // yank them back out to PIN_DELTA every time.
    mapRef.current?.animateCamera({ center: pin }, { duration: 350 });
  }, [pin]);

  const handleMapPress = (event: MapPressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    lastCentred.current = `${latitude},${longitude}`;
    onChange({ latitude, longitude });
  };

  const handleDragEnd = (event: MarkerDragStartEndEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    lastCentred.current = `${latitude},${longitude}`;
    onChange({ latitude, longitude });
  };

  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_GOOGLE}
      style={style}
      initialRegion={{
        latitude: pin?.latitude ?? FALLBACK_REGION.latitude,
        longitude: pin?.longitude ?? FALLBACK_REGION.longitude,
        latitudeDelta: pin ? PIN_DELTA : FALLBACK_REGION.latitudeDelta,
        longitudeDelta: pin ? PIN_DELTA : FALLBACK_REGION.longitudeDelta,
      }}
      onPress={handleMapPress}
      toolbarEnabled={false}
      showsMyLocationButton={false}
    >
      {pin && (
        <Marker
          coordinate={pin}
          draggable
          onDragEnd={handleDragEnd}
          title="Delivery pin"
          description="Drag me to your door"
          pinColor={colors.primary}
        />
      )}
    </MapView>
  );
};

export default AddressPinMapInner;
