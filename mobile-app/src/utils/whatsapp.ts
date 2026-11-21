import { Alert, Linking } from 'react-native';

/**
 * WhatsApp deep links.
 *
 * Numbers are stored locally as `03001234567`; wa.me needs full international
 * form with no plus sign, i.e. `923001234567`.
 */

const PK_COUNTRY_CODE = '92';

/** Strip formatting and convert a local Pakistani number to wa.me form. */
export function toWhatsAppNumber(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '').replace(/^\+/, '');

  if (/^0\d{10}$/.test(digits)) {
    // 03001234567 -> 923001234567
    return PK_COUNTRY_CODE + digits.slice(1);
  }
  if (/^92\d{10}$/.test(digits)) {
    return digits;
  }
  // Already international for some other country — pass through if plausible.
  if (/^\d{10,15}$/.test(digits)) {
    return digits;
  }
  return null;
}

export function canWhatsApp(phone?: string | null): boolean {
  return toWhatsAppNumber(phone) !== null;
}

/**
 * Open a WhatsApp chat, optionally pre-filling a message.
 *
 * Note WhatsApp only accepts text this way — a PDF has to go through the OS
 * share sheet instead (see services/documentService.ts).
 */
export async function openWhatsApp(
  phone?: string | null,
  message?: string,
): Promise<boolean> {
  const number = toWhatsAppNumber(phone);
  if (!number) {
    Alert.alert(
      'No WhatsApp number',
      phone
        ? `"${phone}" is not a valid mobile number.`
        : 'This contact has no phone number saved.',
    );
    return false;
  }

  const url = `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    Alert.alert('WhatsApp unavailable', 'Could not open WhatsApp on this device.');
    return false;
  }
}

/** Money as it should appear inside a WhatsApp message. */
function pkr(value: number | string | null | undefined): string {
  const n = Number(value || 0);
  return `PKR ${Math.abs(n).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
}

/**
 * Balance reminder text. `balance` is the owed-positive figure the ledger API
 * returns, so a positive number means the customer owes money.
 */
export function balanceReminderMessage(opts: {
  businessName?: string;
  customerName: string;
  balance: number;
  bottlesHeld?: number;
}): string {
  const { businessName = 'Century Sip', customerName, balance, bottlesHeld } = opts;
  const lines = [`*${businessName}*`, '', `Dear ${customerName},`];

  if (balance > 0) {
    lines.push('', `Your outstanding balance is *${pkr(balance)}*.`);
  } else if (balance < 0) {
    lines.push('', `You have a credit of *${pkr(balance)}* with us.`);
  } else {
    lines.push('', 'Your account is fully settled. Thank you!');
  }

  if (bottlesHeld) {
    lines.push(`Bottles with you: *${bottlesHeld}*`);
  }
  lines.push('', 'Thank you for your business.');
  return lines.join('\n');
}

/** Confirmation text sent right after recording a payment. */
export function paymentReceivedMessage(opts: {
  businessName?: string;
  customerName: string;
  amount: number | string;
  receiptNumber?: string | null;
  balanceAfter: number;
}): string {
  const { businessName = 'Century Sip', customerName, amount, receiptNumber, balanceAfter } = opts;
  const lines = [
    `*${businessName}*`,
    '',
    `Dear ${customerName},`,
    '',
    `We have received your payment of *${pkr(amount)}*.`,
  ];
  if (receiptNumber) lines.push(`Receipt No: *${receiptNumber}*`);
  lines.push(
    balanceAfter > 0
      ? `Remaining balance: *${pkr(balanceAfter)}*`
      : 'Your account is now fully settled.',
    '',
    'Thank you!',
  );
  return lines.join('\n');
}

export interface OrderDispatchMessageOptions {
  businessName?: string;
  customerName?: string | null;
  orderId: number | string;
  items?: Array<{
    quantity?: number;
    price?: number | string;
    product_details?: { name?: string | null } | null;
    product_name?: string | null;
    name?: string | null;
  }> | null;
  orderTotal?: number | string | null;
  previousBalance?: number | string | null;
  isPaid?: boolean | null;
  shippingAddress?: string | null;
  mode?: 'dispatch' | 'info';
  template?: string | null;
}

export const TEMPLATE_VARIABLES = [
  { key: '{business_name}', label: 'Business Name', sample: 'Century Sip', desc: 'The brand name of the business' },
  { key: '{customer_name}', label: 'Customer Name', sample: 'Hiba', desc: 'Customer full name or guest name' },
  { key: '{order_id}', label: 'Order ID', sample: '9', desc: 'Order number without hash' },
  { key: '{items_list}', label: 'Items List', sample: '• 2× 19L Refill (PKR 360)', desc: 'Bulleted list of items, quantities & prices' },
  { key: '{delivery_address}', label: 'Delivery Address', sample: '76, Upper, Umer, Dawood', desc: 'Saved delivery or shipping address' },
  { key: '{order_total}', label: 'Order Total', sample: 'PKR 360', desc: 'This order total' },
  { key: '{previous_balance}', label: 'Previous Balance', sample: 'PKR 0', desc: 'Previous account ledger balance' },
  { key: '{previous_balance_line}', label: 'Balance Line', sample: '• Previous Balance (Due): PKR 0', desc: 'Pre-formatted previous due/advance line' },
  { key: '{total_payable}', label: 'Total Payable', sample: 'PKR 360', desc: 'Final total amount payable' },
  { key: '{payment_status}', label: 'Payment Status', sample: 'Unpaid', desc: 'Paid Online or Unpaid' },
  { key: '{payment_instruction}', label: 'Payment Note', sample: 'Please keep the cash ready at the time of delivery. 💵', desc: 'Cash/payment instructions' },
  { key: '{rider_name}', label: 'Rider Name', sample: 'Ali Rider', desc: 'Name of the assigned delivery boy' },
  { key: '{date}', label: 'Order Date', sample: '22 Nov 2026', desc: 'Date order was placed' },
] as const;

export interface TemplateContext {
  business_name?: string;
  customer_name?: string;
  order_id?: string | number;
  items_list?: string;
  delivery_address?: string;
  order_total?: string;
  previous_balance?: string;
  previous_balance_line?: string;
  total_payable?: string;
  payment_status?: string;
  payment_instruction?: string;
  rider_name?: string;
  date?: string;
  [key: string]: string | number | undefined;
}

export function renderTemplate(template: string, ctx: TemplateContext): string {
  if (!template) return '';
  let rendered = template;
  for (const [k, v] of Object.entries(ctx)) {
    const val = v !== undefined && v !== null ? String(v) : '';
    const regex = new RegExp(`\\{\\s*${k}\\s*\\}`, 'gi');
    rendered = rendered.replace(regex, val);
  }
  return rendered.replace(/\n{3,}/g, '\n\n').trim();
}

export function buildTemplateContextFromOrder(opts: OrderDispatchMessageOptions): TemplateContext {
  const {
    businessName = 'Century Sip',
    customerName,
    orderId,
    items = [],
    orderTotal,
    previousBalance,
    isPaid = false,
    shippingAddress,
  } = opts;

  const currentTotal = Number(orderTotal || 0);
  const prev =
    previousBalance !== null && previousBalance !== undefined && previousBalance !== ''
      ? Number(previousBalance)
      : 0;

  const itemsLines: string[] = [];
  if (items && items.length > 0) {
    items.forEach((item) => {
      const qty = item.quantity ?? 1;
      const name = item.product_details?.name || item.product_name || item.name || 'Item';
      const unitPrice = Number(item.price || 0);
      const lineTotal = unitPrice > 0 ? unitPrice * qty : 0;
      if (lineTotal > 0) {
        itemsLines.push(`• ${qty}× ${name} (${pkr(lineTotal)})`);
      } else {
        itemsLines.push(`• ${qty}× ${name}`);
      }
    });
  }

  let prevBalanceLine = '';
  let paymentInstruction = '';
  let totalPayable = 0;

  if (isPaid) {
    if (prev > 0) {
      prevBalanceLine = `• Previous Balance (Due): *${pkr(prev)}*`;
      paymentInstruction = 'Please keep cash ready for your previous dues. 💵';
      totalPayable = prev;
    } else {
      totalPayable = 0;
    }
  } else {
    if (prev > 0) {
      prevBalanceLine = `• Previous Balance (Due): *${pkr(prev)}*`;
    } else if (prev < 0) {
      prevBalanceLine = `• Previous Credit / Advance: *- ${pkr(Math.abs(prev))}*`;
    }
    totalPayable = Math.max(0, currentTotal + prev);
    if (totalPayable > 0) {
      paymentInstruction = 'Please keep the cash ready at the time of delivery. 💵';
    } else {
      paymentInstruction = 'Order covered by advance balance.';
    }
  }

  return {
    business_name: businessName,
    customer_name: customerName?.trim() || 'Customer',
    order_id: String(orderId ?? ''),
    items_list: itemsLines.join('\n') || 'No items',
    delivery_address: shippingAddress?.trim() || '—',
    order_total: pkr(currentTotal),
    previous_balance: pkr(prev),
    previous_balance_line: prevBalanceLine,
    total_payable: pkr(totalPayable),
    payment_status: isPaid ? 'Paid Online ✅' : 'Unpaid',
    payment_instruction: paymentInstruction,
    date: new Date().toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }),
  };
}

export function sampleTemplateContext(): TemplateContext {
  return {
    business_name: 'Century Sip',
    customer_name: 'Hiba',
    order_id: '9',
    items_list: '• 2× 19L Refill (PKR 360)',
    delivery_address: '76, Upper, Umer, Dawood',
    order_total: 'PKR 360',
    previous_balance: 'PKR 0',
    previous_balance_line: '',
    total_payable: 'PKR 360',
    payment_status: 'Unpaid',
    payment_instruction: 'Please keep the cash ready at the time of delivery. 💵',
    rider_name: 'Ali Rider',
    date: '22 Nov 2026',
  };
}

/**
 * Detailed order dispatch message sent via WhatsApp to customer.
 * Includes items list, quantities, prices, previous ledger balance,
 * and clear total payable amount.
 */
export function orderDispatchMessage(opts: OrderDispatchMessageOptions): string {
  if (opts.template) {
    return renderTemplate(opts.template, buildTemplateContextFromOrder(opts));
  }
  const {
    businessName = 'Century Sip',
    customerName,
    orderId,
    items = [],
    orderTotal,
    previousBalance,
    isPaid = false,
    shippingAddress,
    mode = 'dispatch',
  } = opts;

  const displayName = customerName?.trim() || 'Customer';
  const greeting =
    mode === 'dispatch'
      ? `Hello *${displayName}*,\nI am on my way with your order *#${orderId}*. 🚚`
      : `Hello *${displayName}*,\nRegarding your order *#${orderId}*:`;

  const lines: string[] = [
    `*${businessName}*`,
    '',
    greeting,
  ];

  // 1. Order Items
  if (items && items.length > 0) {
    lines.push('', '📦 *Order Items:*');
    items.forEach((item) => {
      const qty = item.quantity ?? 1;
      const name = item.product_details?.name || item.product_name || item.name || 'Item';
      const unitPrice = Number(item.price || 0);
      const lineTotal = unitPrice > 0 ? unitPrice * qty : 0;
      if (lineTotal > 0) {
        lines.push(`• ${qty}× ${name} (${pkr(lineTotal)})`);
      } else {
        lines.push(`• ${qty}× ${name}`);
      }
    });
  }

  // 2. Shipping Address
  if (shippingAddress && shippingAddress.trim()) {
    lines.push('', `📍 *Delivery Address:*\n${shippingAddress.trim()}`);
  }

  // 3. Payment details
  lines.push('', '💰 *Payment Summary:*');

  const currentTotal = Number(orderTotal || 0);
  const prev =
    previousBalance !== null && previousBalance !== undefined && previousBalance !== ''
      ? Number(previousBalance)
      : 0;

  if (isPaid) {
    lines.push(`• Order Total: *${pkr(currentTotal)}*`);
    lines.push('• Payment Status: *Paid Online* ✅');

    if (prev > 0) {
      lines.push(`• Previous Balance (Due): *${pkr(prev)}*`);
      lines.push('─────────────────');
      lines.push(`*Total Payable (Previous Due): ${pkr(prev)}*`);
      lines.push('Please keep cash ready for your previous dues. 💵');
    } else {
      lines.push('─────────────────');
      lines.push('*Total to Pay: PKR 0* (Fully Paid)');
    }
  } else {
    lines.push(`• This Order: *${pkr(currentTotal)}*`);

    if (prev > 0) {
      lines.push(`• Previous Balance (Due): *${pkr(prev)}*`);
    } else if (prev < 0) {
      lines.push(`• Previous Credit / Advance: *- ${pkr(Math.abs(prev))}*`);
    }

    const totalToPay = Math.max(0, currentTotal + prev);
    lines.push('─────────────────');
    lines.push(`*Total Payable: ${pkr(totalToPay)}*`);
    if (totalToPay > 0) {
      lines.push('Please keep the cash ready at the time of delivery. 💵');
    } else {
      lines.push('Order covered by advance balance.');
    }
  }

  lines.push('', 'Thank you for choosing us!');
  return lines.join('\n');
}

