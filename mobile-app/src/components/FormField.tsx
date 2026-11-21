import { colors } from '../theme';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Form primitives shared by every form in the app.
 *
 * These started life inside RegisterScreen. They live here so the admin forms
 * mark required fields and describe the password policy exactly the way the
 * customer signup form does — those used to disagree, and staff had no way to
 * tell which fields they could safely skip.
 */

export const OK_GREEN = colors.success;
export const ERROR_RED = colors.danger;

/** Small "Required" / "Optional" pill shown next to a field label. */
export const FieldLabel = ({ text, required }: { text: string; required?: boolean }) => (
  <View style={styles.labelRow}>
    <Text style={styles.label}>{text}</Text>
    <View style={[styles.badge, required ? styles.badgeRequired : styles.badgeOptional]}>
      <Text style={[styles.badgeText, required ? styles.badgeTextRequired : styles.badgeTextOptional]}>
        {required ? 'Required' : 'Optional'}
      </Text>
    </View>
  </View>
);

/** Validation message shown directly beneath the field that caused it. */
export const FieldError = ({ message }: { message?: string }) =>
  message ? <Text style={styles.fieldError}>{message}</Text> : null;

/** A single live-validated rule: grey circle until satisfied, then a green check. */
export const Rule = ({ met, text }: { met: boolean; text: string }) => (
  <View style={styles.ruleRow}>
    <Ionicons
      name={met ? 'checkmark-circle' : 'ellipse-outline'}
      size={16}
      color={met ? OK_GREEN : '#c4c4c4'}
    />
    <Text style={[styles.ruleText, met && styles.ruleTextMet]}>{text}</Text>
  </View>
);

export type PasswordRule = { key: string; met: boolean; text: string };

/**
 * The password policy, mirrored from the backend's PASSWORD_RULES so the
 * checklist can never promise something the server then rejects.
 */
export const passwordRulesFor = (password: string): PasswordRule[] => [
  { key: 'length', met: password.length >= 8, text: 'At least 8 characters' },
  { key: 'upper', met: /[A-Z]/.test(password), text: 'One uppercase letter (A–Z)' },
  { key: 'lower', met: /[a-z]/.test(password), text: 'One lowercase letter (a–z)' },
  { key: 'digit', met: /\d/.test(password), text: 'One number (0–9)' },
  { key: 'special', met: /[^A-Za-z0-9]/.test(password), text: 'One special character (!@#$…)' },
];

export const isPasswordValid = (password: string) =>
  passwordRulesFor(password).every(r => r.met);

/** The live "your password must contain…" checklist. */
export const PasswordRules = ({
  password,
  title = 'Your password must contain:',
}: {
  password: string;
  title?: string;
}) => (
  <View style={styles.rulesBox}>
    <Text style={styles.rulesTitle}>{title}</Text>
    {passwordRulesFor(password).map(rule => (
      <Rule key={rule.key} met={rule.met} text={rule.text} />
    ))}
  </View>
);

export const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  label: {
    fontSize: 14,
    color: colors.ink,
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeRequired: { backgroundColor: colors.dangerBg },
  badgeOptional: { backgroundColor: colors.bg },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  badgeTextRequired: { color: ERROR_RED },
  badgeTextOptional: { color: colors.muted },
  fieldError: {
    fontSize: 12,
    color: ERROR_RED,
    marginTop: 5,
  },
  rulesBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.bg,
    gap: 6,
  },
  rulesTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ruleText: {
    fontSize: 12,
    color: colors.muted,
  },
  ruleTextMet: {
    color: OK_GREEN,
    fontWeight: '600',
  },
});
