"use client";

import { useState, useEffect } from "react";
import {
  User,
  Phone,
  Plus,
  Minus,
  Trash2,
} from "lucide-react";
import type {
  AdminOrder,
  AdminOrderUpdatePayload,
  Product,
} from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ordersApi } from "@/lib/api";
import { productsApi } from "@/lib/api/products";
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

interface CartItem {
  productId: number;
  name: string;
  price: string;
  quantity: number;
}

interface EditOrderModalProps {
  order: AdminOrder | null;
  open: boolean;
  onClose: () => void;
  onUpdated: (updated: AdminOrder) => void;
}

export function EditOrderModal({ order, open, onClose, onUpdated }: EditOrderModalProps) {
  const notify = useToast();
  const deliveryBoys = useDeliveryBoys();
  const products = useAsync(() => productsApi.list(), []);

  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [address, setAddress] = useState<AddressParts>(EMPTY_ADDRESS);
  const [addressErrors, setAddressErrors] = useState<AddressErrors>({});
  const [riderId, setRiderId] = useState<number | "">("");
  const [showToRider, setShowToRider] = useState(true);
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [riderNote, setRiderNote] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Sync state whenever the order prop changes
  useEffect(() => {
    if (order && open) {
      setGuestName(order.guest_name || "");
      setGuestPhone(order.guest_phone || "");
      if (order.house_number || order.area) {
        setAddress({
          house_number: order.house_number || "",
          portion: order.portion || "",
          block: order.block || "",
          area: order.area || "",
        });
      } else if (order.shipping_address) {
        setAddress(splitAddress(order.shipping_address));
      } else {
        setAddress(EMPTY_ADDRESS);
      }
      setAddressErrors({});
      setRiderId(order.assigned_delivery_boy || "");
      setShowToRider(order.show_to_rider !== false);
      setDeliveryNotes(order.delivery_notes || "");
      setRiderNote(order.rider_note || "");

      // Initialise cart from order items
      const initialCart: CartItem[] = (order.items || []).map((it) => {
        const prod = products.data?.find((p) => p.id === (it.product_details?.id ?? it.product_id ?? it.id));
        const id = prod?.id ?? it.product_details?.id ?? it.product_id ?? it.id ?? 0;
        const name = prod?.name ?? it.product_details?.name ?? `Product #${id}`;
        const price = prod?.price ?? it.product_details?.price ?? it.price;
        return {
          productId: id,
          name,
          price: String(price),
          quantity: it.quantity,
        };
      });
      setCart(initialCart);
      setError("");
    }
  }, [order, open, products.data]);

  const addProduct = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === product.id);
      if (existing) {
        return prev.map((c) =>
          c.productId === product.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { productId: product.id, name: product.name, price: product.price, quantity: 1 }];
    });
  };

  const changeQty = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) =>
          c.productId === productId ? { ...c, quantity: c.quantity + delta } : c
        )
        .filter((c) => c.quantity > 0)
    );
  };

  const removeItem = (productId: number) => {
    setCart((prev) => prev.filter((c) => c.productId !== productId));
  };

  const total = cart.reduce(
    (sum, c) => sum + parseFloat(c.price) * c.quantity,
    0
  );

  const submit = async () => {
    if (!order) return;
    setError("");
    const issues = validateAddress(address);
    setAddressErrors(issues);

    if (cart.length === 0) {
      setError("An order must have at least one product.");
      return;
    }
    if (Object.keys(issues).length > 0) {
      setError("Complete the delivery address.");
      return;
    }

    const payload: AdminOrderUpdatePayload = {
      items: cart.map((c) => ({ product_id: c.productId, quantity: c.quantity })),
      house_number: address.house_number.trim(),
      portion: address.portion.trim() || undefined,
      block: address.block.trim() || undefined,
      area: address.area.trim(),
      assigned_delivery_boy: riderId ? Number(riderId) : null,
      show_to_rider: showToRider,
      delivery_notes: deliveryNotes || "",
      rider_note: riderNote || "",
    };

    if (order.guest_name !== null && order.guest_name !== undefined) {
      payload.guest_name = guestName.trim();
      payload.guest_phone = guestPhone.trim();
    }

    setSaving(true);
    try {
      const updated = await ordersApi.adminUpdate(order.id, payload);
      notify("Order updated successfully.");
      onUpdated(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update order.");
    } finally {
      setSaving(false);
    }
  };

  if (!order) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Edit Order #${order.id}`} className="max-w-4xl">
      <div className="flex flex-col gap-5 max-h-[75vh] overflow-y-auto pr-1">

        {/* Customer Information (Editable for Guest orders) */}
        {order.guest_name !== null && order.guest_name !== undefined ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-mist/50">
              Customer Details (Call-in / Guest)
            </p>
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
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-mist/70">
            <span className="font-semibold text-mist">{order.customer_name}</span> (Registered account)
            {order.customer_phone && <span className="ml-2 text-mist/50">· {order.customer_phone}</span>}
          </div>
        )}

        {/* Delivery Address */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-mist/50">
            Delivery Address
          </p>
          <AddressFields value={address} onChange={setAddress} errors={addressErrors} />
        </div>

        {/* Products selection & Cart */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-mist/50">
            Products & Quantities
          </p>

          {products.loading ? (
            <p className="text-sm text-mist/40">Loading products…</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {products.data?.map((product) => {
                const inCart = cart.find((c) => c.productId === product.id);
                return (
                  <button
                    key={product.id}
                    type="button"
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
                      <span className="mt-1 text-xs font-semibold text-wave">×{inCart.quantity} in order</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Cart list */}
          {cart.length > 0 && (
            <div className="mt-1 flex flex-col gap-1 rounded-xl border border-white/10 p-3">
              {cart.map(({ productId, name, price, quantity }) => (
                <div key={productId} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-mist">{name}</span>
                  <button
                    type="button"
                    onClick={() => changeQty(productId, -1)}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-mist hover:bg-white/20"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="w-6 text-center text-sm font-medium text-mist">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => changeQty(productId, 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-mist hover:bg-white/20"
                  >
                    <Plus size={12} />
                  </button>
                  <span className="w-20 text-right text-sm text-mist/60">
                    {formatPrice(parseFloat(price) * quantity)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(productId)}
                    className="text-rose-300/60 hover:text-rose-300"
                    title="Remove item"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <div className="mt-2 flex justify-between border-t border-white/10 pt-2 text-sm font-semibold text-mist">
                <span>Updated Total</span>
                <span className="text-wave">{formatPrice(total)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Delivery Assignment & Notes */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="edit-order-rider" requirement="optional">
              Assigned Rider
            </FieldLabel>
            <select
              id="edit-order-rider"
              value={riderId}
              onChange={(e) => setRiderId(e.target.value ? Number(e.target.value) : "")}
              className="input text-sm"
            >
              <option value="">— Unassigned —</option>
              {deliveryBoys.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {!b.is_available ? "(Unavailable)" : ""}
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
          <div>
            <FieldLabel htmlFor="edit-order-notes" requirement="optional">
              Delivery Notes (Instructions for Rider)
            </FieldLabel>
            <Textarea
              id="edit-order-notes"
              placeholder="e.g. Call before coming, gate code..."
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        {error && <p className="text-sm text-rose-300">{error}</p>}

        <div className="flex justify-end gap-3 pt-2 border-t border-white/10">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            Save Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
}
