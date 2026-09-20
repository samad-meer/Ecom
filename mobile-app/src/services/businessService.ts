import { API_URL } from '../constants/config';
import { getAuthToken } from './authService';

/**
 * Business identity and the account customers can transfer into.
 *
 * The contact fields are public, but the payment block is only returned to a
 * signed-in caller — so this module always sends the token, unlike the
 * anonymous `/ledger/business/` fetches used for the "contact us" button.
 */

/** One account the rider can show at the door. */
export interface PaymentAccount {
  id: number;
  bank_name: string;
  account_title: string;
  account_number: string;
  iban: string;
  qr: string | null;
  instructions: string;
}

export interface PaymentDetails {
  name: string;
  phone: string | null;
  address: string | null;
  payment_account_title: string;
  payment_account_number: string;
  payment_bank_name: string;
  /** Absolute URL, or null when the office has not uploaded one. */
  payment_qr: string | null;
  payment_instructions: string;
  /**
   * Every active account, in the order the office arranged them. The flat
   * payment_* fields above mirror the first one so that builds predating this
   * list keep working.
   */
  payment_accounts?: PaymentAccount[];
  /** False when the office has not set any of this up yet. */
  has_payment_details: boolean;
}

export const businessService = {
  async paymentDetails(): Promise<PaymentDetails> {
    const token = await getAuthToken();
    const res = await fetch(`${API_URL}/ledger/business/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Could not load the payment details.');
    return res.json();
  },
};

/** The line a rider sends a customer who asks for the account over WhatsApp. */
export const formatPaymentDetails = (d: PaymentDetails): string =>
  [
    `${d.name} — online payment`,
    d.payment_bank_name && `Bank: ${d.payment_bank_name}`,
    d.payment_account_title && `Title: ${d.payment_account_title}`,
    d.payment_account_number && `Account: ${d.payment_account_number}`,
    d.payment_instructions,
  ]
    .filter(Boolean)
    .join('\n');
