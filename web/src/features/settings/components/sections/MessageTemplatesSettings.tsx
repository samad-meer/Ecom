"use client";

import { useState, useRef, useMemo } from "react";
import {
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  CheckCircle,
  Star,
  Copy,
  Sparkles,
  Smartphone,
  Eye,
  Info,
} from "lucide-react";
import type { MessageTemplate, MessageTemplateCategory } from "@/lib/types";
import { messageTemplatesApi } from "@/lib/api/orders";
import {
  TEMPLATE_VARIABLES,
  renderTemplate,
  sampleTemplateContext,
} from "@/lib/whatsapp";
import { Button, Input, Modal, useToast } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { SettingsSection } from "../SettingsSection";

const CATEGORY_LABELS: Record<MessageTemplateCategory, string> = {
  order_info: "Order Info / Confirmation",
  order_dispatch: "Order Dispatch / On The Way",
  payment_reminder: "Payment Reminder",
  custom: "Custom Template",
};

const CATEGORY_COLORS: Record<MessageTemplateCategory, string> = {
  order_info: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  order_dispatch: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  payment_reminder: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  custom: "bg-purple-500/15 text-purple-300 border-purple-500/30",
};

const EMPTY_TEMPLATE: {
  name: string;
  category: MessageTemplateCategory;
  content: string;
  is_default: boolean;
} = {
  name: "",
  category: "order_info",
  content: "",
  is_default: false,
};

export function MessageTemplatesSettings() {
  const notify = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: templates, loading, reload } = useAsync<MessageTemplate[]>(
    () => messageTemplatesApi.list(),
    []
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState(EMPTY_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const sampleContext = useMemo(() => sampleTemplateContext(), []);

  const previewContent = useMemo(() => {
    if (!formData.content.trim()) return "Your message preview will appear here...";
    return renderTemplate(formData.content, sampleContext);
  }, [formData.content, sampleContext]);

  const openNewModal = (category: MessageTemplateCategory = "order_info") => {
    setEditingId(null);
    setFormData({
      name: "",
      category,
      content:
        "{business_name}\n\nHello {customer_name},\nRegarding your order #{order_id}:\n\n📦 Order Items:\n{items_list}\n\n📍 Delivery Address:\n{delivery_address}\n\n💰 Payment Summary:\n• This Order: {order_total}\n{previous_balance_line}\n─────────────────\nTotal Payable: {total_payable}\n{payment_instruction}\n\nThank you for choosing us! 💧",
      is_default: (templates ?? []).filter((t) => t.category === category).length === 0,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (tpl: MessageTemplate) => {
    setEditingId(tpl.id);
    setFormData({
      name: tpl.name,
      category: tpl.category,
      content: tpl.content,
      is_default: tpl.is_default,
    });
    setIsModalOpen(true);
  };

  const insertVariable = (variableKey: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setFormData((prev) => ({
        ...prev,
        content: prev.content ? `${prev.content} ${variableKey}` : variableKey,
      }));
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = formData.content;
    const next = current.substring(0, start) + variableKey + current.substring(end);

    setFormData((prev) => ({ ...prev, content: next }));

    // Reset cursor position after insert
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variableKey.length, start + variableKey.length);
    }, 50);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      notify("Please provide a template name.", "error");
      return;
    }
    if (!formData.content.trim()) {
      notify("Please provide template content.", "error");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await messageTemplatesApi.update(editingId, formData);
        notify("Template updated successfully.");
      } else {
        await messageTemplatesApi.create(formData);
        notify("Template created successfully.");
      }
      setIsModalOpen(false);
      reload();
    } catch (e: any) {
      notify(e?.message || "Failed to save template.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tpl: MessageTemplate) => {
    if (!confirm(`Are you sure you want to delete "${tpl.name}"?`)) return;
    try {
      await messageTemplatesApi.remove(tpl.id);
      notify("Template deleted.");
      reload();
    } catch (e: any) {
      notify(e?.message || "Failed to delete template.", "error");
    }
  };

  const handleSetDefault = async (tpl: MessageTemplate) => {
    try {
      await messageTemplatesApi.setDefault(tpl.id);
      notify(`"${tpl.name}" is now the default for ${CATEGORY_LABELS[tpl.category]}.`);
      reload();
    } catch (e: any) {
      notify(e?.message || "Failed to set default template.", "error");
    }
  };

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    if (filterCategory === "all") return templates;
    return templates.filter((t) => t.category === filterCategory);
  }, [templates, filterCategory]);

  return (
    <SettingsSection
      id="message-templates"
      title="Message Templates"
      description="Build and customize templates for WhatsApp and SMS order notifications, dispatch alerts, and payment reminders."
      icon={MessageSquare}
    >
      <div className="flex flex-col gap-4">
        {/* Controls row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterCategory("all")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filterCategory === "all"
                  ? "bg-wave text-ink"
                  : "bg-white/5 text-mist/70 hover:bg-white/10 hover:text-mist"
              }`}
            >
              All ({templates?.length ?? 0})
            </button>
            {(["order_info", "order_dispatch", "payment_reminder", "custom"] as MessageTemplateCategory[]).map(
              (cat) => {
                const count = templates?.filter((t) => t.category === cat).length ?? 0;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFilterCategory(cat)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      filterCategory === cat
                        ? "bg-wave text-ink"
                        : "bg-white/5 text-mist/70 hover:bg-white/10 hover:text-mist"
                    }`}
                  >
                    {CATEGORY_LABELS[cat]} ({count})
                  </button>
                );
              }
            )}
          </div>

          <Button onClick={() => openNewModal()} className="flex items-center gap-1.5 text-xs">
            <Plus size={15} /> New Template
          </Button>
        </div>

        {/* Templates grid */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl bg-white/5" />
            ))}
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 p-8 text-center">
            <MessageSquare size={32} className="mb-2 text-mist/40" />
            <p className="text-sm font-semibold text-mist">No templates found</p>
            <p className="mt-1 text-xs text-mist/60">
              Create a custom template to personalize your customer messages.
            </p>
            <Button onClick={() => openNewModal()} className="mt-4 text-xs">
              <Plus size={14} className="mr-1" /> Create Template
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredTemplates.map((tpl) => (
              <div
                key={tpl.id}
                className={`relative flex flex-col justify-between rounded-2xl border p-4.5 transition ${
                  tpl.is_default
                    ? "border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-transparent"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                }`}
              >
                <div>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-mist">{tpl.name}</h4>
                        {tpl.is_default && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                            <Star size={10} className="fill-emerald-300" /> Default
                          </span>
                        )}
                      </div>
                      <span
                        className={`mt-1 inline-block rounded border px-2 py-0.5 text-[10px] font-semibold ${
                          CATEGORY_COLORS[tpl.category]
                        }`}
                      >
                        {CATEGORY_LABELS[tpl.category]}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {!tpl.is_default && (
                        <button
                          type="button"
                          onClick={() => handleSetDefault(tpl)}
                          title="Set as Default for this category"
                          className="rounded-lg p-1.5 text-mist/40 transition hover:bg-emerald-500/20 hover:text-emerald-300"
                        >
                          <Star size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditModal(tpl)}
                        title="Edit template"
                        className="rounded-lg p-1.5 text-mist/60 transition hover:bg-white/10 hover:text-white"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(tpl)}
                        title="Delete template"
                        className="rounded-lg p-1.5 text-mist/40 transition hover:bg-rose-500/20 hover:text-rose-300"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Body preview */}
                  <div className="mt-2 rounded-xl bg-black/30 p-3 font-mono text-xs text-mist/80 whitespace-pre-line line-clamp-4">
                    {tpl.content}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-[11px] text-mist/40">
                  <span>Updated {new Date(tpl.updated_at).toLocaleDateString()}</span>
                  <button
                    type="button"
                    onClick={() => openEditModal(tpl)}
                    className="flex items-center gap-1 font-semibold text-wave hover:underline"
                  >
                    <Eye size={12} /> Preview & Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Template Builder Modal */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? "Edit Message Template" : "Build Message Template"}
        className="max-w-4xl"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left Column: Form & Variable Palette */}
          <div className="flex flex-col gap-4">
            <div>
              <label className="label">Template Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Standard Dispatch Message"
                className="text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      category: e.target.value as MessageTemplateCategory,
                    }))
                  }
                  className="input w-full text-sm py-2"
                >
                  <option value="order_info">Order Info / Confirmation</option>
                  <option value="order_dispatch">Order Dispatch / On The Way</option>
                  <option value="payment_reminder">Payment Reminder</option>
                  <option value="custom">Custom Message</option>
                </select>
              </div>

              <div className="flex items-center pt-6">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-mist">
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, is_default: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-white/20 bg-white/10 text-wave focus:ring-wave"
                  />
                  <span>Active Default for this category</span>
                </label>
              </div>
            </div>

            {/* Clickable Variable Tags */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="label mb-0">Insert Variables (Click to add)</label>
                <span className="text-[11px] text-mist/40">Click any tag to insert at cursor</span>
              </div>
              <div className="flex flex-wrap gap-1.5 rounded-xl border border-white/10 bg-white/5 p-2.5 max-h-36 overflow-y-auto">
                {TEMPLATE_VARIABLES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    className="group flex items-center gap-1 rounded-lg border border-wave/20 bg-wave/10 px-2 py-1 text-xs font-mono text-wave transition hover:bg-wave hover:text-ink"
                    title={`${v.desc} (Example: ${v.sample})`}
                  >
                    <span>+</span>
                    <span>{v.key}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="label mb-0">Message Content</label>
                <span className="text-[11px] text-mist/40">{formData.content.length} characters</span>
              </div>
              <textarea
                ref={textareaRef}
                rows={9}
                value={formData.content}
                onChange={(e) => setFormData((prev) => ({ ...prev, content: e.target.value }))}
                placeholder="Write your template with variables e.g. {customer_name}"
                className="input w-full font-mono text-xs leading-relaxed p-3"
              />
            </div>
          </div>

          {/* Right Column: Live Phone / WhatsApp Preview */}
          <div className="flex flex-col">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-mist/60 uppercase tracking-wider">
              <Smartphone size={14} className="text-emerald-400" /> Live WhatsApp Preview
            </div>

            {/* Smartphone mockup */}
            <div className="flex-1 rounded-3xl border border-white/20 bg-[#0c1317] p-3 shadow-2xl flex flex-col justify-between">
              {/* WhatsApp Chat Header */}
              <div className="flex items-center gap-2.5 rounded-2xl bg-[#202c33] px-3 py-2 text-white shadow-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 font-bold text-xs text-white">
                  CS
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">Century Sip Bot</p>
                  <p className="text-[10px] text-emerald-400">Official Business Account</p>
                </div>
              </div>

              {/* Chat Bubble */}
              <div className="my-4 flex-1 overflow-y-auto px-1">
                <div className="ml-auto max-w-[92%] rounded-2xl rounded-tr-none bg-[#005c4b] p-3 text-xs text-white shadow-md">
                  <div className="whitespace-pre-line leading-relaxed font-sans select-text">
                    {previewContent}
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-white/60">
                    <span>11:45 AM</span>
                    <span className="text-sky-300">✓✓</span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-white/5 p-2 text-center text-[10px] text-mist/40">
                Sample preview with order #9, customer Hiba & Century Sip branding.
              </div>
            </div>
          </div>
        </div>

        {/* Modal actions */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-white/10 pt-4">
          <Button variant="ghost" onClick={() => setIsModalOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {editingId ? "Save Changes" : "Create Template"}
          </Button>
        </div>
      </Modal>
    </SettingsSection>
  );
}
