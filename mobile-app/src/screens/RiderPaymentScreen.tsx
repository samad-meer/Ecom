import { colors, radius, card, pagePadding } from '../theme';
import React, { useCallback, useState } from 'react';
import {
  View, Text, Image, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, RefreshControl, Share, Alert, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  PaymentAccount, PaymentDetails, businessService, formatPaymentDetails,
} from '../services/businessService';
import { ErrorState, EmptyState, friendlyError } from '../components/ui';

const BRAND_BLUE = colors.primary;
const PAGE_BG = colors.bg;

/**
 * What a rider shows a customer who wants to pay by transfer instead of cash.
 *
 * Its own screen rather than a section inside the delivery form: it gets held
 * up for someone else to read and scan, so it has to be reachable in one tap
 * and carry nothing that is none of the customer's business — no order totals,
 * no other stops, no balances.
 */
export const RiderPaymentScreen: React.FC = () => {
  const { width } = useWindowDimensions();
  const [details, setDetails] = useState<PaymentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true); else setLoading(true);
    try {
      setDetails(await businessService.paymentDetails());
      setError(null);
    } catch (e: any) {
      // Keep whatever is already on screen: a rider mid-doorstep would rather
      // read slightly stale account details than a blank error page.
      setError(e?.message || 'Could not load the payment details.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Re-read on focus so an account changed in the office reaches the rider
  // without them restarting the app.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  /**
   * Every account to show, newest API shape first.
   *
   * A server that predates `payment_accounts` still sends only the flat
   * payment_* fields, so those are folded into a single synthetic account
   * rather than leaving the rider with a blank screen after a partial deploy.
   */
  const accounts: PaymentAccount[] = details?.payment_accounts?.length
    ? details.payment_accounts
    : details && (details.payment_account_number || details.payment_qr)
      ? [{
          id: 0,
          bank_name: details.payment_bank_name,
          account_title: details.payment_account_title,
          account_number: details.payment_account_number,
          iban: '',
          qr: details.payment_qr,
          instructions: details.payment_instructions,
        }]
      : [];

  const shareAccount = async (account: PaymentAccount) => {
    if (!details) return;
    const message = [
      `${details.name} — online payment`,
      account.bank_name && `Bank: ${account.bank_name}`,
      account.account_title && `Title: ${account.account_title}`,
      account.account_number && `Account: ${account.account_number}`,
      account.iban && `IBAN: ${account.iban}`,
      account.instructions,
    ].filter(Boolean).join('\n');
    try {
      await Share.share({ message });
    } catch (e: any) {
      Alert.alert('Could not share', `The share sheet did not open. ${friendlyError(e?.message)}`);
    }
  };

  if (loading && !details) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={BRAND_BLUE} />
      </View>
    );
  }

  // The QR is square and is meant to be scanned from across a doorstep, so it
  // takes as much width as the page allows rather than a fixed size.
  // Page gutters, the card's 20px padding and its 1px border, each side.
  const qrSize = Math.min(width - 2 * pagePadding - 2 * 21, 320);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load('refresh')}
          colors={[colors.primary]}
          tintColor={BRAND_BLUE}
        />
      }
    >
      {/* A failed refresh keeps the account details below; they may be a little old. */}
      {!!error && !!details && (
        <View style={styles.errorBox}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.warningText} />
          <Text style={styles.errorText}>{friendlyError(error)} Pull down to try again.</Text>
        </View>
      )}

      {/* Nothing loaded yet and the request failed: say so, and let the rider retry. */}
      {!!error && !details && (
        <ErrorState
          title="Could not load the payment details"
          message={error}
          onRetry={() => load()}
        />
      )}

      {details && !details.has_payment_details ? (
        <View style={styles.emptyCard}>
          <EmptyState
            icon="card-outline"
            title="No online payment set up"
            text="The office has not added an account yet. Take cash for now, and ask them to fill it in under Settings."
            style={styles.emptyInCard}
          />
        </View>
      ) : details ? (
        <>
          <Text style={styles.pageTitle}>Pay {details.name}</Text>
          <Text style={styles.pageSub}>
            {accounts.length > 1
              ? 'Show the customer whichever bank they use — a transfer between the same bank arrives instantly.'
              : 'Show this to the customer to take a transfer.'}
          </Text>

          {accounts.map((account, index) => (
            <View key={account.id ?? index} style={styles.accountBlock}>
              {accounts.length > 1 && (
                <View style={styles.accountHeadingRow}>
                  <View style={styles.accountHeadingIcon}>
                    <Ionicons name="business" size={18} color={colors.primary} />
                  </View>
                  <Text style={styles.accountHeading}>{account.bank_name}</Text>
                </View>
              )}

              {!!account.qr && (
                <View style={styles.qrCard}>
                  <View style={styles.qrFrame}>
                    <Image
                      source={{ uri: account.qr }}
                      style={{ width: qrSize, height: qrSize }}
                      resizeMode="contain"
                      accessibilityLabel={`${account.bank_name} payment QR code`}
                    />
                  </View>
                  <Text style={styles.qrCaption}>Scan to pay</Text>
                </View>
              )}

              <View style={styles.detailCard}>
                {!!account.bank_name && <Row label="Bank" value={account.bank_name} />}
                {!!account.account_title && (
                  <Row label="Account title" value={account.account_title} divided />
                )}
                {!!account.account_number && (
                  <Row label="Account number" value={account.account_number} divided mono />
                )}
                {!!account.iban && <Row label="IBAN" value={account.iban} divided mono />}
              </View>
              <Text style={styles.copyHint}>Press and hold a number to copy it.</Text>

              {!!account.instructions && (
                <View style={styles.noteBox}>
                  <Ionicons name="information-circle" size={18} color={colors.warningText} />
                  <Text style={styles.noteText}>{account.instructions}</Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.shareBtn}
                onPress={() => shareAccount(account)}
                activeOpacity={0.9}
              >
                <Ionicons name="share-social" size={20} color={colors.white} />
                <Text style={styles.shareBtnText}>
                  {accounts.length > 1 ? `Send ${account.bank_name} details` : 'Send details to customer'}
                </Text>
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.footnoteBox}>
            <Ionicons name="information-circle-outline" size={18} color={colors.primaryDark} />
            <Text style={styles.footnote}>
              Record the payment on the delivery as an online payment, not as cash —
              only cash has to be handed in at the end of your shift.
            </Text>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
};

const Row = ({ label, value, divided, mono }: {
  label: string; value: string; divided?: boolean; mono?: boolean;
}) => (
  <View style={[styles.row, divided && styles.rowDivided]}>
    <Text style={styles.rowLabel}>{label}</Text>
    {/* Account numbers and IBANs are one unbroken string: shrink the type to
        fit rather than let the line break halfway through the number. */}
    <Text
      style={[styles.rowValue, mono && styles.rowValueMono]}
      selectable
      numberOfLines={mono ? 1 : undefined}
      adjustsFontSizeToFit={!!mono}
      minimumFontScale={0.6}
    >
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAGE_BG },
  // Bottom clearance is for the floating contact button, which parks above the
  // bottom edge and would otherwise sit on top of the last card.
  content: { paddingHorizontal: pagePadding, paddingTop: pagePadding, paddingBottom: 96 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: PAGE_BG },

  pageTitle: { fontSize: 24, fontWeight: '800', color: colors.ink },
  pageSub: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginTop: 4, marginBottom: 16 },

  accountBlock: { marginBottom: 24 },
  accountHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  accountHeadingIcon: {
    width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.primaryTint,
    alignItems: 'center', justifyContent: 'center',
  },
  accountHeading: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.ink },
  qrCard: {
    ...card,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  // White behind the code whatever the page colour, so scanners get a clean edge.
  qrFrame: { backgroundColor: colors.white, borderRadius: radius.md, overflow: 'hidden' },
  qrCaption: { fontSize: 14, color: colors.textSecondary, marginTop: 12, fontWeight: '700' },

  detailCard: {
    ...card,
    paddingHorizontal: 16,
  },
  row: { paddingVertical: 14 },
  rowDivided: { borderTopWidth: 1, borderTopColor: colors.lineSoft },
  rowLabel: { fontSize: 12, color: colors.muted, fontWeight: '700', marginBottom: 4 },
  rowValue: { fontSize: 16, color: colors.ink, fontWeight: '700' },
  // Account numbers are read aloud and copied digit by digit, so they get
  // tabular figures and a little more tracking.
  rowValueMono: { fontVariant: ['tabular-nums'], letterSpacing: 0.6, fontSize: 20, fontWeight: '800' },
  copyHint: { fontSize: 12, color: colors.muted, marginTop: 8, textAlign: 'center' },

  noteBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warningLine,
    borderRadius: radius.md, padding: 12, marginTop: 12,
  },
  noteText: { flex: 1, fontSize: 14, color: colors.warningText, lineHeight: 20 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warningLine,
    borderRadius: radius.md, padding: 12, marginBottom: 12,
  },
  errorText: { flex: 1, fontSize: 14, color: colors.warningText, lineHeight: 20 },

  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: BRAND_BLUE, borderRadius: radius.md, height: 54, marginTop: 16,
  },
  shareBtnText: { color: colors.white, fontSize: 16, fontWeight: '800' },

  footnoteBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: colors.primaryTint, borderRadius: radius.md, padding: 12,
  },
  footnote: { flex: 1, fontSize: 14, color: colors.textSecondary, lineHeight: 20 },

  emptyCard: { ...card },
  emptyInCard: { paddingVertical: 32 },
});
