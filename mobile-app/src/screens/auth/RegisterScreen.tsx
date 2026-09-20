import React, { useState, useContext, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { AuthContext, type AuthError } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { IS_GOOGLE_SIGNIN_CONFIGURED } from '../../constants/googleConfig';
import {
  FieldLabel, FieldError, Rule, PasswordRules, isPasswordValid,
} from '../../components/FormField';
import {
  AddressFields, EMPTY_ADDRESS, validateAddress, type AddressParts,
} from '../../components/AddressFields';

const BRAND_BLUE = '#0A84FF';
const TEXT_DARK = '#000';
const PLACEHOLDER = '#000';
const OK_GREEN = '#34C759';

// Pakistani mobile numbers: 03xx-xxxxxxx, +923xxxxxxxxx or 923xxxxxxxxx
const PHONE_PATTERN = /^(?:\+92|92|0)3\d{9}$/;
const stripPhoneSeparators = (value: string) => value.replace(/[\s\-().]/g, '');

const RegisterScreen = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState<AddressParts>(EMPTY_ADDRESS);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  // Per-field messages from local checks and from the backend's 400 response.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const { register, isLoading, error, clearError } = useContext(AuthContext);
  // Whatever failed on some other screen is not this form's problem.
  useEffect(() => { clearError(); }, [clearError]);
  const { t } = useLanguage();
  const navigation = useNavigation<any>();

  // ── Live validation ───────────────────────────────────────────────────────
  // The rules themselves live in components/FormField so the admin's
  // "add customer" form promises exactly the same policy this screen does.
  const passwordValid = isPasswordValid(password);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const isPhoneValid = PHONE_PATTERN.test(stripPhoneSeparators(phoneNumber));
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  /** Update a field and drop any stale error sitting on it. */
  const bind = (field: string, setValue: (v: string) => void) => (value: string) => {
    setValue(value);
    setFieldErrors(prev => {
      if (!prev[field]) return prev;
      const { [field]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const validateLocally = () => {
    const required = t('field_required', 'This field is required');
    const errors: Record<string, string> = {};

    if (!username.trim()) errors.username = required;
    if (!email.trim()) errors.email = required;
    else if (!isEmailValid) errors.email = t('email_invalid', 'Please enter a valid email address');

    if (!phoneNumber.trim()) errors.phone_number = required;
    else if (!isPhoneValid) errors.phone_number = t('phone_invalid', 'Enter a valid mobile number, e.g. 0300-1234567');

    Object.assign(errors, validateAddress(address));

    if (!password) errors.password = required;
    else if (!passwordValid) errors.password = t('password_weak', 'Your password does not meet all the requirements below');

    if (!confirmPassword) errors.password_confirm = required;
    else if (password !== confirmPassword) errors.password_confirm = t('passwords_mismatch', 'Passwords do not match');

    return errors;
  };

  const handleRegister = async () => {
    const errors = validateLocally();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setFormMessage(t('fix_highlighted_fields', 'Please fix the highlighted fields below'));
      return;
    }

    setFieldErrors({});
    setFormMessage(null);

    try {
      await register({
        username: username.trim(),
        email: email.trim(),
        password,
        password_confirm: confirmPassword,
        phone_number: stripPhoneSeparators(phoneNumber),
        house_number: address.house_number.trim(),
        portion: address.portion,
        block: address.block.trim(),
        area: address.area.trim(),
      });
      // Navigation is handled by AuthContext state change or manual navigation if auto-login not implemented
    } catch (e) {
      // Everything the user typed stays put — only the messages change.
      const authError = e as AuthError;
      const backendErrors = authError?.fieldErrors;

      if (backendErrors) {
        const { non_field_errors, detail, ...perField } = backendErrors;
        setFieldErrors(perField);
        setFormMessage(
          non_field_errors ||
            detail ||
            (Object.keys(perField).length
              ? t('fix_highlighted_fields', 'Please fix the highlighted fields below')
              : authError.message)
        );
      } else {
        // No field mapping (network/timeout) — surface it as an alert.
        Alert.alert(
          t('registration_failed', 'Registration Failed'),
          e instanceof Error ? e.message : t('error_occurred', 'An error occurred')
        );
      }
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.formContainer}>
          <Text style={styles.title}>{t('create_account', 'Create Account')}</Text>
          <Text style={styles.subtitle}>{t('sign_up_started', 'Sign up to get started')}</Text>

          {/* ── Account details ────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>{t('section_account', 'Account Details')}</Text>

          <View style={styles.inputContainer}>
            <FieldLabel text={t('username_label', 'Username')} required />
            <TextInput
              style={[styles.input, fieldErrors.username && styles.inputInvalid]}
              placeholder={t('username_choose_placeholder', 'Choose a username')}
              placeholderTextColor={PLACEHOLDER}
              value={username}
              onChangeText={bind('username', setUsername)}
              autoCapitalize="none"
            />
            <FieldError message={fieldErrors.username} />
          </View>

          <View style={styles.inputContainer}>
            <FieldLabel text={t('email_label', 'Email')} required />
            <View style={[styles.inputRow, fieldErrors.email && styles.inputInvalid]}>
              <TextInput
                style={styles.rowInput}
                placeholder={t('email_placeholder', 'Enter your email')}
                placeholderTextColor={PLACEHOLDER}
                value={email}
                onChangeText={bind('email', setEmail)}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {email.length > 0 && (
                <Ionicons
                  name={isEmailValid ? 'checkmark-circle' : 'close-circle'}
                  size={20}
                  color={isEmailValid ? OK_GREEN : '#FF3B30'}
                  style={styles.rowIcon}
                />
              )}
            </View>
            <FieldError message={fieldErrors.email} />
          </View>

          <View style={styles.inputContainer}>
            <FieldLabel text={t('password_label', 'Password')} required />
            <View style={[styles.passwordContainer, fieldErrors.password && styles.inputInvalid]}>
              <TextInput
                style={styles.passwordInput}
                placeholder={t('password_placeholder', 'Enter your password')}
                placeholderTextColor={PLACEHOLDER}
                value={password}
                onChangeText={bind('password', setPassword)}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeIcon}
                accessibilityLabel={showPassword ? t('hide_password', "Hide password") : t('show_password', "Show password")}
              >
                <Ionicons
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={24}
                  color="#666"
                />
              </TouchableOpacity>
            </View>
            <FieldError message={fieldErrors.password} />

            {/* Live password checklist */}
            <PasswordRules
              password={password}
              title={t('password_must_contain', 'Your password must contain:')}
            />
          </View>

          <View style={styles.inputContainer}>
            <FieldLabel text={t('confirm_password_label', 'Confirm Password')} required />
            <View style={[styles.passwordContainer, fieldErrors.password_confirm && styles.inputInvalid]}>
              <TextInput
                style={styles.passwordInput}
                placeholder={t('confirm_password_placeholder', 'Confirm your password')}
                placeholderTextColor={PLACEHOLDER}
                value={confirmPassword}
                onChangeText={bind('password_confirm', setConfirmPassword)}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                style={styles.eyeIcon}
                accessibilityLabel={showConfirmPassword ? t('hide_confirm_password', "Hide confirm password") : t('show_confirm_password', "Show confirm password")}
              >
                <Ionicons
                  name={showConfirmPassword ? 'eye-off' : 'eye'}
                  size={24}
                  color="#666"
                />
              </TouchableOpacity>
            </View>
            <FieldError message={fieldErrors.password_confirm} />
            {confirmPassword.length > 0 && (
              <View style={styles.rulesBoxTight}>
                <Rule
                  met={passwordsMatch}
                  text={passwordsMatch
                    ? t('passwords_match', 'Passwords match')
                    : t('passwords_mismatch', 'Passwords do not match')}
                />
              </View>
            )}
          </View>

          {/* ── Contact & delivery ─────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>{t('section_contact', 'Contact & Delivery')}</Text>

          <View style={styles.inputContainer}>
            <FieldLabel text={t('phone_label', 'Phone Number')} required />
            <View style={[styles.inputRow, fieldErrors.phone_number && styles.inputInvalid]}>
              <TextInput
                style={styles.rowInput}
                placeholder={t('phone_placeholder', '03xx-xxxxxxx')}
                placeholderTextColor={PLACEHOLDER}
                value={phoneNumber}
                onChangeText={bind('phone_number', setPhoneNumber)}
                keyboardType="phone-pad"
                maxLength={16}
              />
              {phoneNumber.length > 0 && (
                <Ionicons
                  name={isPhoneValid ? 'checkmark-circle' : 'close-circle'}
                  size={20}
                  color={isPhoneValid ? OK_GREEN : '#FF3B30'}
                  style={styles.rowIcon}
                />
              )}
            </View>
            <FieldError message={fieldErrors.phone_number} />
            <Text style={styles.helperText}>
              {t('phone_hint', 'Pakistani mobile number, e.g. 0300-1234567')}
            </Text>
          </View>

          {/* The whole address comes from the shared component, so signup and
              the admin forms stay identical and the layout is fixed in one
              place rather than three. */}
          <View style={styles.inputContainer}>
            <AddressFields
              value={address}
              onChange={next => {
                setAddress(next);
                // Clear any stale per-field errors the backend sent back.
                setFieldErrors(prev => {
                  const { house_number, portion, block, area, ...rest } = prev;
                  return rest;
                });
              }}
              errors={fieldErrors}
              hint={t('address_hint', 'We use this as your default delivery address')}
            />
          </View>

          {(formMessage || error) && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color="#D93025" />
              <Text style={styles.errorText}>{formMessage || error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.button}
            onPress={handleRegister}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t('signup_btn', 'Sign Up')}</Text>
            )}
          </TouchableOpacity>

          {IS_GOOGLE_SIGNIN_CONFIGURED && (
            <>
              {/* Divider */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              <GoogleSignInButton
                label="Sign up with Google"
                failureTitle="Google Sign-Up Failed"
                disabled={isLoading}
              />
            </>
          )}

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.linkText}>{t('have_account_login', 'Already have an account? Login')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  formContainer: {
    width: '100%',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#888',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 14,
  },
  inputContainer: {
    marginBottom: 15,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  label: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeRequired: { backgroundColor: '#FFE5E5' },
  badgeOptional: { backgroundColor: '#EFEFEF' },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  badgeTextRequired: { color: '#D93025' },
  badgeTextOptional: { color: '#777' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    color: TEXT_DARK,
    backgroundColor: '#f9f9f9',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  rowInput: {
    flex: 1,
    padding: 15,
    fontSize: 16,
    color: TEXT_DARK,
  },
  rowIcon: {
    marginRight: 14,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  passwordInput: {
    flex: 1,
    padding: 15,
    fontSize: 16,
    color: TEXT_DARK,
  },
  eyeIcon: {
    padding: 10,
  },
  rulesBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f6f8fa',
    gap: 6,
  },
  rulesBoxTight: {
    marginTop: 8,
  },
  rulesTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#555',
    marginBottom: 2,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ruleText: {
    fontSize: 12,
    color: '#888',
  },
  ruleTextMet: {
    color: OK_GREEN,
    fontWeight: '600',
  },
  helperText: {
    fontSize: 12,
    color: '#888',
    marginTop: 5,
  },
  button: {
    backgroundColor: BRAND_BLUE,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  addressRow: { flexDirection: 'row', gap: 8, marginBottom: 15 },
  addressCol: { flex: 1 },
  areaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  areaChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fafafa',
  },
  areaChipActive: { backgroundColor: '#0A84FF', borderColor: '#0A84FF' },
  areaChipText: { fontSize: 13, fontWeight: '600', color: '#666' },
  areaChipTextActive: { color: '#fff' },
  inputInvalid: {
    borderColor: '#D93025',
    backgroundColor: '#FFF7F7',
  },
  fieldError: {
    fontSize: 12,
    color: '#D93025',
    marginTop: 5,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F5C6C4',
    backgroundColor: '#FFF0EF',
  },
  errorText: {
    flex: 1,
    color: '#D93025',
    fontSize: 13,
    fontWeight: '500',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
    gap: 10,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e0e0e0' },
  dividerText: { fontSize: 12, color: '#aaa', fontWeight: '600' },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 14,
    backgroundColor: '#fff',
  },
  googleIcon: {
    fontSize: 18,
    fontWeight: '800',
    color: '#EA4335',
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  linkButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    color: BRAND_BLUE,
    fontSize: 14,
  },
});

export default RegisterScreen;
