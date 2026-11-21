import { colors } from '../theme';
import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  MAX_IMAGES,
  MAX_IMAGE_SIZE,
  MAX_IMAGE_SIZE_LABEL,
  PickedImage,
} from '../constants/imageLimits';

interface Props {
  label?: string;
  value: PickedImage[];
  onChange: (images: PickedImage[]) => void;
  /** URLs of already-saved images (edit mode). Hidden once new ones are picked. */
  existing?: string[];
  max?: number;
}

/**
 * Pick up to `max` images (default 3), each at most 5 MB, with thumbnail
 * previews and remove buttons. Returns FormData-ready {uri,name,type} objects.
 */
export function MultiImagePicker({
  label = 'Images',
  value,
  onChange,
  existing = [],
  max = MAX_IMAGES,
}: Props) {
  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to attach images.');
      return;
    }

    const remaining = max - value.length;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });
    if (result.canceled) return;

    const picked: PickedImage[] = [];
    for (const asset of result.assets) {
      if (asset.fileSize && asset.fileSize > MAX_IMAGE_SIZE) {
        Alert.alert('Image too large', `Each image must be ${MAX_IMAGE_SIZE_LABEL} or smaller.`);
        return;
      }
      const name = asset.fileName || asset.uri.split('/').pop() || `image_${Date.now()}.jpg`;
      const type = asset.mimeType || 'image/jpeg';
      picked.push({ uri: asset.uri, name, type });
    }

    const combined = [...value, ...picked].slice(0, max);
    onChange(combined);
  };

  const removeAt = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const showExisting = existing.length > 0 && value.length === 0;
  const canAddMore = value.length < max;

  return (
    <View>
      <Text style={styles.label}>
        {label} <Text style={styles.hint}>(up to {max}, {MAX_IMAGE_SIZE_LABEL} each)</Text>
      </Text>
      <View style={styles.row}>
        {showExisting &&
          existing.map((url, i) => (
            <Image key={`ex-${i}`} source={{ uri: url }} style={styles.thumb} />
          ))}

        {value.map((img, i) => (
          <View key={`new-${i}`} style={styles.thumbWrap}>
            <Image source={{ uri: img.uri }} style={styles.thumb} />
            <TouchableOpacity style={styles.removeBtn} onPress={() => removeAt(i)}>
              <Ionicons name="close" size={13} color="#fff" />
            </TouchableOpacity>
          </View>
        ))}

        {canAddMore && (
          <TouchableOpacity style={styles.addBtn} onPress={pick}>
            <Ionicons name="image-outline" size={22} color={colors.muted} />
            <Text style={styles.addText}>Add</Text>
          </TouchableOpacity>
        )}
      </View>
      {showExisting && (
        <Text style={styles.replaceHint}>Adding new images will replace the current ones.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: colors.ink, marginBottom: 6, marginTop: 4 },
  hint: { fontSize: 12, fontWeight: '400', color: colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbWrap: { position: 'relative' },
  thumb: { width: 76, height: 76, borderRadius: 14, backgroundColor: colors.lineSoft },
  removeBtn: {
    position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center',
  },
  addBtn: {
    width: 76, height: 76, borderRadius: 14, borderWidth: 1, borderColor: colors.line,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceTint,
  },
  addText: { fontSize: 12, color: colors.muted, marginTop: 2 },
  replaceHint: { fontSize: 12, color: colors.muted, marginTop: 4 },
});
