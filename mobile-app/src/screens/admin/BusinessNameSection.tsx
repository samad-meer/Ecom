import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, fontSize, card, pagePadding } from '../../theme';
import { friendlyError } from '../../components/ui';
import { useDialog } from '../../components/AppDialog';
import { useBrand } from '../../context/BrandContext';

/** Lets the admin rename the business: the name in the app header, on the
 *  loading screen and on printed receipts. */
export function BusinessNameSection() {
  const { notify } = useDialog();
  const { name, rename } = useBrand();
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);

  // Follow the saved name (it arrives from the server after first render).
  useEffect(() => { setDraft(name); }, [name]);

  const dirty = draft.trim() !== name && draft.trim().length > 0;

  const save = async () => {
    setSaving(true);
    try {
      await rename(draft);
      void notify({ title: 'Saved', message: `The app is now called "${draft.trim()}".` });
    } catch (e: any) {
      void notify({
        title: 'Could not save',
        message: `The name was not changed. ${friendlyError(e?.message)}`,
        tone: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons name="storefront" size={20} color={colors.primary} />
        </View>
        <Text style={styles.sectionTitle}>App Name</Text>
      </View>
      <Text style={styles.desc}>
        Shown in the app header and on receipts. The name under the app icon on a phone's home
        screen is fixed by the installed app and only changes with a new build.
      </Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          maxLength={150}
          placeholder="Business name"
          placeholderTextColor={colors.muted}
          autoCapitalize="words"
        />
        <TouchableOpacity
          style={[styles.saveBtn, (!dirty || saving) && { opacity: 0.4 }]}
          onPress={save}
          disabled={!dirty || saving}
          accessibilityLabel="Save app name"
        >
          {saving
            ? <ActivityIndicator size="small" color={colors.white} />
            : <Text style={styles.saveText}>Save</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { ...card, padding: space.lg, marginHorizontal: pagePadding, marginBottom: space.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  sectionIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryTint,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { flex: 1, fontSize: fontSize.md, fontWeight: '800', color: colors.ink },
  desc: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 20, marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: {
    flex: 1, height: 52, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 14, fontSize: fontSize.md, fontWeight: '700', color: colors.ink,
    backgroundColor: colors.surfaceTint,
  },
  saveBtn: {
    height: 52, backgroundColor: colors.primary, borderRadius: radius.md,
    paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center',
  },
  saveText: { color: colors.white, fontWeight: '800', fontSize: fontSize.sm },
});
