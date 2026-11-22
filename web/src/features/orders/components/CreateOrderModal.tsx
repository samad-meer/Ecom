"use client";

import { useState, useEffect } from "react";
import {
  User,
  UserX,
  Phone,
  CreditCard,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  Package,
  CheckCircle2,
  Wallet,
  Clock,
} from "lucide-react";
import type {
  CreateAdminOrderPayload,
  CustomerOrderStats,
  Product,
} from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ordersApi } from "@/lib/api";
import { productsApi } from "@/lib/api/products";
import { plantApi } from "@/lib/api/plant";
import {
  AddressFields,
  Button,
  FieldLabel,
  Input,
  Modal,
  Textarea,
  splitAddress,
  validateAddress,
  EMPTY_ADDRESS,
  useToast,
  type AddressErrors,
  type AddressParts,
} from "@/components/ui";
import { useDeliveryBoys } from "../hooks/useAdminOrders";
import { useAsync } from "@/hooks/useAsync";

type CustomerMode = "existing" | "guest";

interface CartItem {
  product: Product;
  quantity: number;
}

interface CreateOrderModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

// ─── Customer stats card ──────────────────────────────────────────────────────

function CustomerStatsCard({ userId }: { userId: number }) {
  const [stats, setStats] = useState<CustomerOrderStats | null>(null);

  useEffect(() => {
    ordersApi.customerStats(userId).then(setStats).catch(() => null);
  }, [userId]);

  if (!stats) return null;

  const balanceColor =
    stats.account_balance === null
      ? "text-mist/50"
      : stats.account_balance < 0
      ? "text-rose-300"
      : stats.account_balance > 0
      ? "text-emerald-300"
      : "text-mist/50";

  const lastDate = stats.last_order_date
    ? new Date(stats.last_order_date).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

  return (
    <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/5 p-3 sm:grid-cols-4">
      <div className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-mist/40">
          <Package size={10} /> Total Orders
        </span>
        <span className="text-sm font-semibold text-mist">{stats.total_orders}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-mist/40">
          <CheckCircle2 size={10} /> Delivered
        </span>
        <span className="text-sm font-semibold text-mist">{stats.delivered_count}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-mist/40">
          <Clock size={10} /> Last Order
        </span>
        <span className="text-sm font-semibold text-mist">{lastDate}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-mist/40">
          <Wallet size={10} /> Balance
        </span>
        <span className={cn("text-sm font-semibold", balanceColor)}>
          {stats.account_balance === null
            ? "—"
            : (stats.account_balance >= 0 ? "+" : "") +
              formatPrice(stats.account_balance)}
        </span>
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function CreateOrderModal({ open, onClose, onCreated }: CreateOrderModalProps) {
  const notify = useToast();
  const deliveryBoys = useDeliveryBoys();
  const customers = useAsync(() => plantApi.customers(), []);
  const products = useAsync(() => productsApi.list(), []);

  const [mode, setMode] = useState<CustomerMode>("existing");
  const [userId, setUserId] = useState<number | "">("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [address, setAddress] = useState<AddressParts>(EMPTY_ADDRESS);
  const [addressErrors, setAddressErrors] = useState<AddressErrors>({});
  const [riderId, setRiderId] = useState<number | "">("");
  const [showToRider, setShowToRider] = useState(true);
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Auto-fill address when selecting existing customer. The customer list only
  // carries the composed line, so it has to be split back into parts.
  useEffect(() => {
    if (mode === "existing" && userId) {
      const c = customers.data?.find((c) => c.id === userId);
      if (c?.address) setAddress(splitAddress(c.address));
    }
  }, [userId, mode, customers.data]);

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setMode("existing");
      setUserId("");
      setGuestName("");
      setGuestPhone("");
      setAddress(EMPTY_ADDRESS);
      setAddressErrors({});
      setRiderId("");
      setShowToRider(true);
      setDeliveryNotes("");
      setCart([]);
      setError("");
    }
  }, [open]);

  const addProduct = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        return prev.map((c) =>
          c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const changeQty = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) =>
          c.product.id === productId ? { ...c, quantity: c.quantity + delta } : c
        )
        .filter((c) => c.quantity > 0)
    );
  };

  const removeItem = (productId: number) => {
    setCart((prev) => prev.filter((c) => c.product.id !== productId));
  };

  const total = cart.reduce(
    (sum, c) => sum + parseFloat(c.product.price) * c.quantity,
    0
  );

  const submit = async () => {
    setError("");
    const issues = validateAddress(address);
    setAddressErrors(issues);

    if (cart.length === 0) { setError("Add at least one product."); return; }
    if (Object.keys(issues).length > 0) { setError("Complete the delivery address."); return; }
    if (mode === "existing" && !userId) { setError("Select a customer."); return; }
    if (mode === "guest" && !guestName.trim()) { setError("Guest name is required."); return; }

    // Parts only — the backend composes `shipping_address` from them, so
    // sending both would let the two disagree.
    const payload: CreateAdminOrderPayload = {
      house_number: address.house_number.trim(),
      portion: address.portion.trim() || undefined,
      block: address.block.trim() || undefined,
      area: address.area.trim(),
      payment_method: "COD",
      assigned_delivery_boy: riderId || null,
      show_to_rider: showToRider,
      delivery_notes: deliveryNotes || undefined,
      status: "Processing",
      items: cart.map((c) => ({ product_id: c.product.id, quantity: c.quantity })),
    };

    if (mode === "existing" && userId) {
      payload.user_id = userId as number;
    } else {
      payload.guest_name = guestName;
      payload.guest_phone = guestPhone || undefined;
    }

    setSaving(true);
    try {
      await ordersApi.adminCreate(payload);
      notify("Order created successfully.");
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create order.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Order" className="max-w-4xl">
      <div className="flex flex-col gap-5 max-h-[75vh] overflow-y-auto pr-1">

        {/* Customer section */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-mist/50">Customer</p>
          <div className="flex gap-2">
            {(["existing", "guest"] as CustomerMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition",
                  mode === m
                    ? "border-wave bg-wave/10 text-wave"
                    : "border-white/10 bg-white/5 text-mist/60 hover:bg-white/10"
                )}
              >
                {m === "existing" ? <User size={14} /> : <UserX size={14} />}
                {m === "existing" ? "Existing user" : "Guest (call-in)"}
              </button>
            ))}
          </div>

          {mode === "existing" ? (
            <>
              <div>
                <FieldLabel htmlFor="order-customer" requirement="required">
                  Customer
                </FieldLabel>
                <select
                  id="order-customer"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : "")}
                  className="input text-sm"
                >
                  <option value="">— Select customer —</option>
                  {customers.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `· ${c.phone}` : ""}{c.address ? ` (${c.address.slice(0, 28)})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              {userId !== "" && <CustomerStatsCard userId={userId as number} />}
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Name"
                requirement="required"
                placeholder="Customer name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                icon={<User size={15} />}
              />
              <Input
                label="Phone"
                requirement="optional"
                placeholder="03xx-xxxxxxx"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                icon={<Phone size={15} />}
              />
            </div>
          )}
        </div>

        {/* Outside the mode branch on purpose — a guest order needs an address
            just as much as an account order does. */}
        <AddressFields value={address} onChange={setAddress} errors={addressErrors} />

        {/* Products */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-mist/50">Products</p>

          {products.loading ? (
            <p className="text-sm text-mist/40">Loading products…</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {products.data?.map((product) => {
                const inCart = cart.find((c) => c.product.id === product.id);
                return (
                  <button
                    key={product.id}
                    onClick={() => addProduct(product)}
                    className={cn(
                      "flex flex-col rounded-xl border p-3 text-left text-sm transition",
                      inCart
                        ? "border-wave bg-wave/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    )}
                  >
                    <span className="font-medium text-mist leading-tight">{product.name}</span>
                    <span className="mt-1 text-xs text-mist/60">{formatPrice(product.price)}</span>
                    {inCart && (
                      <span className="mt-1 text-xs font-semibold text-wave">×{inCart.quantity} in cart</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Cart */}
          {cart.length > 0 && (
            <div className="mt-1 flex flex-col gap-1 rounded-xl border border-white/10 p-3">
              {cart.map(({ product, quantity }) => (
                <div key={product.id} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-mist">{product.name}</span>
                  <button
                    onClick={() => changeQty(product.id, -1)}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-mist hover:bg-white/20"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="w-6 text-center text-sm font-medium text-mist">{quantity}</span>
                  <button
                    onClick={() => changeQty(product.id, 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-mist hover:bg-white/20"
                  >
                    <Plus size={12} />
                  </button>
                  <span className="w-20 text-right text-sm text-mist/60">
                    {formatPrice(parseFloat(product.price) * quantity)}
                  </span>
                  <button
                    onClick={() => removeItem(product.id)}
                    className="text-rose-300/60 hover:text-rose-300"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-white/10 pt-2 text-sm font-semibold text-mist">
                <span>Total</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Payment — cash only, so there is nothing to pick */}
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
          <CreditCard size={15} className="text-wave" />
          <span className="text-sm text-mist/70">Payment: Cash on Delivery</span>
        </div>

        {/* Rider assignment */}
        <div>
          <FieldLabel htmlFor="order-rider" requirement="optional">
            Assign rider
          </FieldLabel>
          <select
            id="order-rider"
            value={riderId}
            onChange={(e) => setRiderId(e.target.value ? Number(e.target.value) : "")}
            className="input text-sm"
          >
            <option value="">— Assign later —</option>
            {deliveryBoys.data?.map((db) => (
              <option key={db.id} value={db.id}>
                {db.name}{db.is_available ? "" : " (busy)"}
              </option>
            ))}
          </select>
          <label className="mt-3 flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showToRider}
              onChange={(e) => setShowToRider(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-white/5 text-wave accent-sky-500 focus:ring-0"
            />
            <span className="text-xs font-medium text-mist">
              Show order to rider in rider app
            </span>
          </label>
        </div>

        {/* Note for the rider. Named for its audience rather than "Delivery
            notes", which read like something the customer might see — and the
            API no longer sends it to them, so the label should say so. */}
        <div>
          <Textarea
            id="order-delivery-notes"
            label="Note for the rider"
            requirement="optional"
            value={deliveryNotes}
            onChange={(e) => setDeliveryNotes(e.target.value)}
            placeholder="Gate code 1234 · Call on arrival · Leave with the guard"
            rows={2}
            className="text-sm"
          />
          <p className="mt-1 text-xs text-mist/50">
            Shown only to the rider delivering this order. The customer never sees it.
          </p>
        </div>

        {error && <p className="text-sm text-rose-300">{error}</p>}

        <div className="flex gap-3 pt-1">
          <Button onClick={submit} loading={saving} fullWidth>
            <ShoppingBag size={16} /> Create order
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={saving} fullWidth>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
