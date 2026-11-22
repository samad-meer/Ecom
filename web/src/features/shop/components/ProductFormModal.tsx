"use client";

import { useState, useEffect, useMemo } from "react";
import { Tag, FileText, DollarSign } from "lucide-react";
import type { Product } from "@/lib/types";
import type { ProductInput } from "@/lib/api/products";
import { adminProductsApi, categoriesApi } from "@/lib/api";
import { Button, FieldLabel, Input, Modal, MultiImagePicker, useToast } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";

interface ProductFormModalProps {
  open: boolean;
  product?: Product | null; // null = create mode
  onClose: () => void;
  onSaved: (product: Product) => void;
}

export function ProductFormModal({ open, product, onClose, onSaved }: ProductFormModalProps) {
  const notify = useToast();
  // Active only: a retired category must never be picked for a product.
  // Refetched on open so a category hidden from the manager modal disappears
  // here without a page reload.
  const categories = useAsync(() => categoriesApi.list({ active: true }), [open]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [isActive, setIsActive] = useState(true);
  const [isRefill, setIsRefill] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEdit = !!product;

  // The product being edited may already sit in a category that has since been
  // hidden. Dropping it from the picker would reset the field to "no category"
  // and silently wipe it on save, so keep it as an extra, clearly-marked
  // option — it stays selected unless the user picks something else.
  const currentCategory = product?.category_details ?? null;
  const activeCategories = useMemo(() => categories.data ?? [], [categories.data]);
  const categoryOptions = useMemo(
    () =>
      currentCategory && !activeCategories.some((c) => c.id === currentCategory.id)
        ? [...activeCategories, currentCategory]
        : activeCategories,
    [activeCategories, currentCategory]
  );
  const selectedIsHidden =
    categoryId !== "" &&
    !categories.loading &&
    !activeCategories.some((c) => c.id === categoryId);

  // Populate form when editing
  useEffect(() => {
    if (product) {
      setName(product.name);
      setDescription(product.description || "");
      setPrice(product.price);
      setCategoryId(product.category_details?.id ?? "");
      setIsActive(product.is_active);
      setIsRefill(Boolean(product.is_refill ?? (product.name && /refill/i.test(product.name))));
      setImageFiles([]);
      // Prefer the gallery; fall back to the legacy single image.
      const urls = product.images?.length
        ? product.images.map((img) => img.image)
        : product.image
          ? [product.image]
          : [];
      setExistingImages(urls);
    } else {
      setName("");
      setDescription("");
      setPrice("");
      setCategoryId("");
      setIsActive(true);
      setIsRefill(false);
      setImageFiles([]);
      setExistingImages([]);
    }
    setErrors({});
  }, [product, open]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required.";
    const p = parseFloat(price);
    if (!price || isNaN(p) || p < 0) errs.price = "Enter a valid price.";
    return errs;
  };

  const submit = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const payload: ProductInput = {
        name: name.trim(),
        description: description.trim(),
        price,
        is_active: isActive,
        is_refill: isRefill,
        category: categoryId || null,
        // Only send images when the user picked new ones; otherwise keep existing.
        images: imageFiles.length ? imageFiles : undefined,
      };
      const saved = isEdit
        ? await adminProductsApi.update(product.id, payload)
        : await adminProductsApi.create(payload);
      notify(`Product ${isEdit ? "updated" : "created"} successfully.`);
      onSaved(saved);
      onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to save.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit — ${product?.name}` : "New Product"}
      className="max-w-3xl"
    >
      <div className="flex flex-col gap-4 max-h-[75vh] overflow-y-auto pr-1">
        {/* Name */}
        <Input
          label="Product name"
          requirement="required"
          placeholder="e.g. 20L Water Bottle"
          value={name}
          onChange={(e) => setName(e.target.value)}
          icon={<Tag size={15} />}
          error={errors.name}
        />

        {/* Description */}
        <div>
          <FieldLabel htmlFor="product-description" requirement="optional">
            Description
          </FieldLabel>
          <div className="relative">
            <span className="absolute left-3.5 top-3 text-mist/40">
              <FileText size={15} />
            </span>
            <textarea
              id="product-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short product description…"
              rows={3}
              className="input w-full resize-none pl-11 text-sm"
            />
          </div>
        </div>

        {/* Price + Category row */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Price (Rs.)"
            requirement="required"
            placeholder="0.00"
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            icon={<DollarSign size={15} />}
            error={errors.price}
          />
          <div>
            <FieldLabel htmlFor="product-category" requirement="optional">
              Category
            </FieldLabel>
            <select
              id="product-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : "")}
              className="input text-sm"
            >
              <option value="">— No category —</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {activeCategories.some((a) => a.id === c.id) ? c.name : `${c.name} (hidden)`}
                </option>
              ))}
            </select>
            {selectedIsHidden && (
              <p className="mt-1 text-[11px] text-amber-300/80">
                This category is hidden from customers. It stays on the product
                until you pick another one.
              </p>
            )}
          </div>
        </div>

        {/* Active toggle */}
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-mist">Active</p>
            <p className="text-xs text-mist/50">Visible to customers in the shop</p>
          </div>
          <button
            type="button"
            onClick={() => setIsActive((v) => !v)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              isActive ? "bg-wave" : "bg-white/20"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                isActive ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Refill / Priority Pin toggle */}
        <div className="flex items-center justify-between rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">Refill Product</span>
              <span className="rounded bg-sky-400/20 px-2 py-0.5 text-[10px] font-bold tracking-wider text-sky-300 border border-sky-400/30">
                PINNED ON TOP
              </span>
            </div>
            <p className="text-xs text-mist/70 mt-0.5">
              Refill bottles show at the top of the mobile app with a special animated card
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsRefill((v) => !v)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
              isRefill ? "bg-sky-500" : "bg-white/20"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
                isRefill ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Image upload (gallery, up to 3) */}
        <MultiImagePicker
          label="Product images (optional)"
          value={imageFiles}
          onChange={setImageFiles}
          existing={existingImages}
          onError={(msg) => notify(msg, "error")}
        />

        <div className="flex gap-3 pt-1">
          <Button onClick={submit} loading={saving} fullWidth>
            {isEdit ? "Save changes" : "Create product"}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={saving} fullWidth>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
