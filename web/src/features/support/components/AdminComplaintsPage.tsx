"use client";

import { useState, useCallback, useEffect } from "react";
import {
  LifeBuoy, Clock, Loader2, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, Send, User, Plus, Trash2,
  Pencil, X, Search,
} from "lucide-react";
import type { AdminComplaint, AdminCustomer, ComplaintStatus } from "@/lib/types";
import { adminComplaintsApi, customersApi } from "@/lib/api";
import { Button, Card, Input, Modal, MultiImagePicker, Skeleton, useToast } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { formatDate, imageUrl } from "@/lib/format";
import { cn } from "@/lib/cn";

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<ComplaintStatus, { label: string; color: string; icon: typeof Clock }> = {
  PENDING:     { label: "Pending",     color: "bg-amber-400/15 text-amber-300",   icon: Clock },
  IN_PROGRESS: { label: "In Progress", color: "bg-sky-400/15 text-sky-300",       icon: Loader2 },
  RESOLVED:    { label: "Resolved",    color: "bg-emerald-400/15 text-emerald-300", icon: CheckCircle2 },
};

// ─── Create / Edit Modal ───────────────────────────────────────────────────────

function ComplaintFormModal({
  open,
  complaint,
  onClose,
  onSaved,
}: {
  open: boolean;
  complaint: AdminComplaint | null;
  onClose: () => void;
  onSaved: (c: AdminComplaint) => void;
}) {
  const notify = useToast();
  const isEdit = !!complaint;

  const [customerId, setCustomerId] = useState<number | "">("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Pre-fill when editing
  useEffect(() => {
    if (complaint) {
      setSubject(complaint.subject);
      setDescription(complaint.description);
    } else {
      setSubject("");
      setDescription("");
      setCustomerId("");
      setCustomerSearch("");
    }
    setImages([]);
    setErrors({});
  }, [complaint, open]);

  // Load customers for create mode
  useEffect(() => {
    if (!open || isEdit) return;
    setLoadingCustomers(true);
    customersApi.list().then(setCustomers).finally(() => setLoadingCustomers(false));
  }, [open, isEdit]);

  const filteredCustomers = customers.filter((c) => {
    const q = customerSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.username.toLowerCase().includes(q) ||
      (c.phone || "").includes(q)
    );
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!isEdit && !customerId) e.customerId = "Select a customer.";
    if (!subject.trim()) e.subject = "Subject is required.";
    if (!description.trim()) e.description = "Description is required.";
    return e;
  };

  const handleSave = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    try {
      const saved = isEdit
        ? await adminComplaintsApi.edit(complaint.id, { subject: subject.trim(), description: description.trim() })
        : await adminComplaintsApi.create({
            user_id: customerId as number,
            subject: subject.trim(),
            description: description.trim(),
            images: images.length ? images : undefined,
          });
      notify(`Complaint ${isEdit ? "updated" : "created"}.`);
      onSaved(saved);
      onClose();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to save.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit Complaint" : "New Complaint"} className="max-w-3xl">
      <div className="flex flex-col gap-4">
        {/* Customer selector (create only) */}
        {!isEdit && (
          <div>
            <label className="label">Customer</label>
            {loadingCustomers ? (
              <Skeleton className="h-10" />
            ) : (
              <>
                <div className="relative mb-1">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-mist/40" />
                  <input
                    type="text"
                    placeholder="Search customers…"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="input w-full py-2 pl-8 text-sm"
                  />
                </div>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : "")}
                  className="input w-full text-sm"
                  size={5}
                >
                  <option value="">— Select customer —</option>
                  {filteredCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `· ${c.phone}` : ""}
                    </option>
                  ))}
                </select>
                {errors.customerId && <p className="mt-1 text-xs text-rose-400">{errors.customerId}</p>}
              </>
            )}
          </div>
        )}

        {/* Subject */}
        <Input
          label="Subject"
          placeholder="e.g. Late delivery"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          error={errors.subject}
        />

        {/* Description */}
        <div>
          <label className="label">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue in detail…"
            rows={4}
            className="input w-full resize-none text-sm"
          />
          {errors.description && <p className="mt-1 text-xs text-rose-400">{errors.description}</p>}
        </div>

        {/* Attachments (create mode only) */}
        {!isEdit && (
          <MultiImagePicker
            label="Attach photos (optional)"
            value={images}
            onChange={setImages}
            onError={(msg) => notify(msg, "error")}
          />
        )}

        <div className="flex gap-3 pt-1">
          <Button onClick={handleSave} loading={saving} fullWidth>
            {isEdit ? "Save changes" : "Create complaint"}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={saving} fullWidth>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Complaint row (expandable) ────────────────────────────────────────────────

function ComplaintRow({
  complaint,
  onUpdated,
  onEdit,
  onDeleted,
}: {
  complaint: AdminComplaint;
  onUpdated: (c: AdminComplaint) => void;
  onEdit: (c: AdminComplaint) => void;
  onDeleted: (id: number) => void;
}) {
  const notify = useToast();
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply] = useState(complaint.admin_reply ?? "");
  const [newStatus, setNewStatus] = useState<ComplaintStatus>(complaint.status);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const cfg = STATUS_CFG[complaint.status];

  const handleSaveReply = async () => {
    setSaving(true);
    try {
      const updated = await adminComplaintsApi.reply(complaint.id, {
        admin_reply: reply.trim() || undefined,
        status: newStatus,
      });
      notify("Updated.");
      onUpdated(updated);
      setExpanded(false);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      await adminComplaintsApi.delete(complaint.id);
      notify("Complaint deleted.");
      onDeleted(complaint.id);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed.", "error");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className={cn(
      "rounded-xl border border-white/10 bg-white/5 transition",
      complaint.status === "RESOLVED" && "opacity-60"
    )}>
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        {/* Avatar */}
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-wave/10 text-wave">
          <User size={14} />
        </div>

        {/* Info — clickable to expand */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-mist">{complaint.user_name}</span>
            <span className="text-xs text-mist/40">{complaint.user_email}</span>
          </div>
          <p className="mt-0.5 text-sm text-mist/80">{complaint.subject}</p>
          <p className="mt-0.5 text-xs text-mist/40">{formatDate(complaint.created_at)}</p>
        </button>

        {/* Status badge + actions */}
        <div className="flex shrink-0 items-center gap-2">
          <span className={cn("flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", cfg.color)}>
            <cfg.icon size={11} />
            {cfg.label}
          </span>

          {/* Edit */}
          <button
            onClick={() => onEdit(complaint)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-mist/40 transition hover:bg-white/10 hover:text-wave"
            title="Edit"
          >
            <Pencil size={13} />
          </button>

          {/* Delete */}
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                disabled={deleting}
                onClick={handleDelete}
                className="rounded px-2 py-0.5 text-xs font-medium text-rose-300 hover:bg-rose-400/10"
              >
                {deleting ? "…" : "Confirm"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded px-1 py-0.5 text-xs text-mist/40 hover:bg-white/10"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleDelete}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-mist/40 transition hover:bg-rose-400/10 hover:text-rose-300"
              title="Delete"
            >
              <Trash2 size={13} />
            </button>
          )}

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-mist/40 transition hover:bg-white/10"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded reply panel */}
      {expanded && (
        <div className="border-t border-white/10 px-4 pb-4 pt-3">
          {/* Description */}
          <div className="mb-4 rounded-lg bg-white/5 p-3 text-sm leading-relaxed text-mist/80">
            {complaint.description}
          </div>

          {/* Attachments */}
          {complaint.images && complaint.images.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {complaint.images.map((img) => (
                <a
                  key={img.id}
                  href={imageUrl(img.image) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-20 w-20 overflow-hidden rounded-lg border border-white/10"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl(img.image) ?? undefined} alt="Attachment" className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          )}

          {/* Existing reply */}
          {complaint.admin_reply && (
            <div className="mb-4 rounded-lg border border-wave/20 bg-wave/5 p-3">
              <p className="mb-1 text-xs font-medium text-wave">Previous reply</p>
              <p className="text-sm text-mist/80">{complaint.admin_reply}</p>
              {complaint.admin_reply_at && (
                <p className="mt-1 text-xs text-mist/40">{formatDate(complaint.admin_reply_at)}</p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3">
            {/* Status */}
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-mist/60">Status</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as ComplaintStatus)}
                className="input py-1.5 text-sm"
              >
                <option value="PENDING">Pending</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </div>

            {/* Reply textarea */}
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write a reply to the customer…"
              rows={3}
              className="input w-full resize-none text-sm"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setExpanded(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-mist/50 hover:text-mist"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveReply}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-wave px-4 py-1.5 text-sm font-medium text-abyss transition hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function AdminComplaintsPage() {
  const [filterStatus, setFilterStatus] = useState<ComplaintStatus | "">("");
  const [formOpen, setFormOpen] = useState(false);
  const [editComplaint, setEditComplaint] = useState<AdminComplaint | null>(null);

  const { data, loading, error, setData } = useAsync(
    () => adminComplaintsApi.list(filterStatus || undefined),
    [filterStatus]
  );

  const handleUpdated = useCallback((updated: AdminComplaint) => {
    setData((prev) => prev ? prev.map((c) => (c.id === updated.id ? updated : c)) : prev);
  }, [setData]);

  const handleDeleted = useCallback((id: number) => {
    setData((prev) => prev ? prev.filter((c) => c.id !== id) : prev);
  }, [setData]);

  const handleSaved = useCallback((saved: AdminComplaint) => {
    setData((prev) => {
      if (!prev) return [saved];
      const exists = prev.find((c) => c.id === saved.id);
      if (exists) return prev.map((c) => (c.id === saved.id ? saved : c));
      return [saved, ...prev];
    });
  }, [setData]);

  const openCreate = () => { setEditComplaint(null); setFormOpen(true); };
  const openEdit = (c: AdminComplaint) => { setEditComplaint(c); setFormOpen(true); };

  const total = data?.length ?? 0;
  const pending = data?.filter((c) => c.status === "PENDING").length ?? 0;
  const inProgress = data?.filter((c) => c.status === "IN_PROGRESS").length ?? 0;
  const resolved = data?.filter((c) => c.status === "RESOLVED").length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-mist">
            <LifeBuoy size={22} className="text-wave" />
            Complaints
          </h1>
          <p className="mt-0.5 text-sm text-mist/50">
            Manage and respond to customer support requests
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} /> New Complaint
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total",       value: total,      color: "bg-sky-400/15 text-sky-300" },
          { label: "Pending",     value: pending,    color: "bg-amber-400/15 text-amber-300" },
          { label: "In Progress", value: inProgress, color: "bg-blue-400/15 text-blue-300" },
          { label: "Resolved",    value: resolved,   color: "bg-emerald-400/15 text-emerald-300" },
        ].map(({ label, value, color }) => (
          <Card key={label} className="flex items-center gap-3 p-4">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold", color)}>
              {value}
            </div>
            <p className="text-xs text-mist/60">{label}</p>
          </Card>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {(["", "PENDING", "IN_PROGRESS", "RESOLVED"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition",
              filterStatus === s ? "bg-wave/15 text-wave" : "text-mist/50 hover:bg-white/5 hover:text-mist"
            )}
          >
            {s === "" ? "All" : s === "IN_PROGRESS" ? "In Progress" : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : error ? (
        <Card className="border-rose-400/30 p-6 text-center text-rose-200">
          <AlertCircle size={24} className="mx-auto mb-2" />
          {error}
        </Card>
      ) : !data || data.length === 0 ? (
        <Card className="p-10 text-center text-mist/40">
          <LifeBuoy size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No complaints found.</p>
          <button onClick={openCreate} className="mt-3 text-sm text-wave hover:underline">
            Create one →
          </button>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {data.map((c) => (
            <ComplaintRow
              key={c.id}
              complaint={c}
              onUpdated={handleUpdated}
              onEdit={openEdit}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      <ComplaintFormModal
        open={formOpen}
        complaint={editComplaint}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
