"use client";

import { useState, useMemo } from "react";
import {
  Users, UserPlus, Search, Phone, MapPin, Package,
  Filter, Calendar, RotateCcw, X, ArrowUpDown,
} from "lucide-react";
import { Button, Card, PageHeader, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { AdminCustomer } from "@/lib/types";
import { useCustomers } from "../hooks/useCustomers";
import { matchesCustomerSearch } from "../search";
import { AddCustomerModal } from "./AddCustomerModal";
import { CustomerDetailModal } from "./CustomerDetailModal";

type CardFilter = "all" | "thisMonth" | "withPhone" | "withAddress";
type StatusFilter = "all" | "active" | "inactive";
type PhoneFilter = "all" | "with" | "without";
type AddressFilter = "all" | "with" | "without";
type SortOption = "newest" | "oldest" | "name_asc" | "name_desc";

// ─── Summary cards ────────────────────────────────────────────────────────────

interface SummaryCardsProps {
  customers: AdminCustomer[];
  activeCard: CardFilter;
  onFilter: (f: CardFilter) => void;
}

function SummaryCards({ customers, activeCard, onFilter }: SummaryCardsProps) {
  const total = customers.length;
  const withPhone = customers.filter((c) => c.phone && c.phone.trim()).length;
  const withAddress = customers.filter((c) => c.address && c.address.trim()).length;
  const thisMonth = customers.filter((c) => {
    const d = new Date(c.date_joined);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const filterCard = (
    filter: CardFilter,
    icon: React.ReactNode,
    label: string,
    value: number,
    iconCls: string,
    activeBorderCls: string,
  ) => {
    const active = activeCard === filter;
    return (
      <button
        type="button"
        onClick={() => onFilter(active ? "all" : filter)}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-all",
          "hover:bg-white/10",
          active
            ? cn("bg-white/10", activeBorderCls)
            : "border-white/10 bg-white/5 hover:border-white/20",
        )}
      >
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconCls)}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-mist/50">{label}</p>
          <p className="text-lg font-bold text-mist">{value}</p>
        </div>
        {active && (
          <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-mist/40">
            active
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {filterCard("all", <Users size={20} />, "Total", total, "bg-wave/15 text-wave", "border-wave/50")}
      {filterCard("thisMonth", <UserPlus size={20} />, "This Month", thisMonth, "bg-emerald-400/15 text-emerald-300", "border-emerald-400/50")}
      {filterCard("withPhone", <Phone size={20} />, "With Phone", withPhone, "bg-sky-400/15 text-sky-300", "border-sky-400/50")}
      {filterCard("withAddress", <MapPin size={20} />, "With Address", withAddress, "bg-indigo-400/15 text-indigo-300", "border-indigo-400/50")}
    </div>
  );
}

// ─── Customer row ─────────────────────────────────────────────────────────────

function CustomerRow({ customer, onView }: { customer: AdminCustomer; onView: () => void }) {
  const initials = (customer.name || customer.username || "?").charAt(0).toUpperCase();
  const joined = customer.date_joined
    ? new Date(customer.date_joined).toLocaleDateString("en-PK", {
        day: "numeric", month: "short", year: "numeric",
      })
    : "—";

  return (
    <tr
      className="cursor-pointer border-b border-white/5 transition hover:bg-white/5"
      onClick={onView}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-glow",
            customer.is_active ? "bg-wave-gradient" : "bg-white/20",
          )}>
            {initials}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <p className={cn("font-semibold", customer.is_active ? "text-mist" : "text-mist/40 line-through")}>{customer.name}</p>
              {!customer.is_active && (
                <span className="rounded-full bg-rose-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">Inactive</span>
              )}
            </div>
            <p className="text-xs text-mist/40">@{customer.username}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-mist/60">{customer.email || "—"}</td>
      <td className="px-4 py-3 text-sm text-mist/60">{customer.phone || "—"}</td>
      <td className="hidden px-4 py-3 text-sm text-mist/60 lg:table-cell">
        {customer.address
          ? <span className="line-clamp-1 max-w-xs">{customer.address}</span>
          : "—"}
      </td>
      <td className="hidden px-4 py-3 text-xs text-mist/40 sm:table-cell">{joined}</td>
      <td className="px-4 py-3 text-right">
        <button className="rounded-lg px-3 py-1 text-xs font-medium text-wave transition hover:bg-wave/10">
          View
        </button>
      </td>
    </tr>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function CustomersPage() {
  const customersList = useCustomers();
  const [search, setSearch] = useState("");
  const [activeCard, setActiveCard] = useState<CardFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [phoneFilter, setPhoneFilter] = useState<PhoneFilter>("all");
  const [addressFilter, setAddressFilter] = useState<AddressFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<AdminCustomer | null>(null);

  const now = useMemo(() => new Date(), []);

  const filtered = useMemo(() => {
    let list = customersList.data ?? [];

    // Search query
    if (search.trim()) {
      list = list.filter((c) => matchesCustomerSearch(c, search));
    }

    // Quick card filter
    if (activeCard === "thisMonth") {
      list = list.filter((c) => {
        if (!c.date_joined) return false;
        const d = new Date(c.date_joined);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
    } else if (activeCard === "withPhone") {
      list = list.filter((c) => !!c.phone && c.phone.trim() !== "");
    } else if (activeCard === "withAddress") {
      list = list.filter((c) => !!c.address && c.address.trim() !== "");
    }

    // Account Status filter
    if (statusFilter === "active") {
      list = list.filter((c) => c.is_active);
    } else if (statusFilter === "inactive") {
      list = list.filter((c) => !c.is_active);
    }

    // Phone filter
    if (phoneFilter === "with") {
      list = list.filter((c) => !!c.phone && c.phone.trim() !== "");
    } else if (phoneFilter === "without") {
      list = list.filter((c) => !c.phone || c.phone.trim() === "");
    }

    // Address filter
    if (addressFilter === "with") {
      list = list.filter((c) => !!c.address && c.address.trim() !== "");
    } else if (addressFilter === "without") {
      list = list.filter((c) => !c.address || c.address.trim() === "");
    }

    // Date From
    if (dateFrom) {
      const from = new Date(dateFrom + "T00:00:00").getTime();
      list = list.filter((c) => c.date_joined && new Date(c.date_joined).getTime() >= from);
    }

    // Date To
    if (dateTo) {
      const to = new Date(dateTo + "T23:59:59").getTime();
      list = list.filter((c) => c.date_joined && new Date(c.date_joined).getTime() <= to);
    }

    // Sorting
    return [...list].sort((a, b) => {
      if (sortBy === "newest") {
        return new Date(b.date_joined || 0).getTime() - new Date(a.date_joined || 0).getTime();
      }
      if (sortBy === "oldest") {
        return new Date(a.date_joined || 0).getTime() - new Date(b.date_joined || 0).getTime();
      }
      if (sortBy === "name_asc") {
        return (a.name || "").localeCompare(b.name || "");
      }
      if (sortBy === "name_desc") {
        return (b.name || "").localeCompare(a.name || "");
      }
      return 0;
    });
  }, [customersList.data, search, activeCard, statusFilter, phoneFilter, addressFilter, dateFrom, dateTo, sortBy, now]);

  const hasActiveFilters =
    search.trim() !== "" ||
    activeCard !== "all" ||
    statusFilter !== "all" ||
    phoneFilter !== "all" ||
    addressFilter !== "all" ||
    dateFrom !== "" ||
    dateTo !== "" ||
    sortBy !== "newest";

  const resetFilters = () => {
    setSearch("");
    setActiveCard("all");
    setStatusFilter("all");
    setPhoneFilter("all");
    setAddressFilter("all");
    setDateFrom("");
    setDateTo("");
    setSortBy("newest");
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          icon={Users}
          title="Customers"
          subtitle="All registered customer accounts"
        />
        <Button onClick={() => setAddOpen(true)}>
          <UserPlus size={16} /> Add Customer
        </Button>
      </div>

      {/* Summary cards */}
      {customersList.loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : customersList.data && customersList.data.length > 0 ? (
        <SummaryCards
          customers={customersList.data}
          activeCard={activeCard}
          onFilter={(f) => {
            setActiveCard(f);
            if (f === "withPhone") setPhoneFilter("with");
            else if (f === "withAddress") setAddressFilter("with");
            else if (f === "all") {
              if (phoneFilter === "with") setPhoneFilter("all");
              if (addressFilter === "with") setAddressFilter("all");
            }
          }}
        />
      ) : null}

      {/* Filter Toolbar */}
      {!customersList.loading && (
        <div className="glass flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 p-3">
          {/* Search Input */}
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-mist/40" />
            <input
              type="text"
              placeholder="Search name, phone, email, address…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input w-full py-1.5 pl-9 pr-7 text-sm"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-mist/40 hover:text-mist"
                title="Clear search"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>

          {/* Account Status Filter */}
          <div className="flex items-center gap-1.5">
            <Filter size={14} className="hidden text-wave sm:inline" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="input w-auto py-1.5 text-sm"
              title="Filter by account status"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>

          {/* Phone Filter */}
          <select
            value={phoneFilter}
            onChange={(e) => {
              const val = e.target.value as PhoneFilter;
              setPhoneFilter(val);
              if (val === "with") setActiveCard("withPhone");
              else if (activeCard === "withPhone") setActiveCard("all");
            }}
            className="input w-auto py-1.5 text-sm"
            title="Filter by phone presence"
          >
            <option value="all">All Phone</option>
            <option value="with">With Phone</option>
            <option value="without">Missing Phone</option>
          </select>

          {/* Address Filter */}
          <select
            value={addressFilter}
            onChange={(e) => {
              const val = e.target.value as AddressFilter;
              setAddressFilter(val);
              if (val === "with") setActiveCard("withAddress");
              else if (activeCard === "withAddress") setActiveCard("all");
            }}
            className="input w-auto py-1.5 text-sm"
            title="Filter by address presence"
          >
            <option value="all">All Addresses</option>
            <option value="with">With Address</option>
            <option value="without">Missing Address</option>
          </select>

          {/* Date Joined Range */}
          <div className="flex items-center gap-1.5">
            <Calendar size={14} className="hidden text-wave sm:inline" />
            <input
              type="date"
              title="Joined from"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input w-auto px-2.5 py-1.5 text-sm"
            />
            <span className="text-sm text-mist/30">→</span>
            <input
              type="date"
              title="Joined to"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input w-auto px-2.5 py-1.5 text-sm"
            />
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-1.5">
            <ArrowUpDown size={14} className="hidden text-mist/40 sm:inline" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="input w-auto py-1.5 text-sm"
              title="Sort customers by"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="name_asc">Name (A → Z)</option>
              <option value="name_desc">Name (Z → A)</option>
            </select>
          </div>

          {/* Reset Filters button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-400/20"
            >
              <RotateCcw size={13} /> Reset Filters
            </button>
          )}
        </div>
      )}

      {/* Active filters summary badges */}
      {!customersList.loading && hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-mist/40">Active filters:</span>
          {search && (
            <span className="inline-flex items-center gap-1 rounded-full border border-wave/30 bg-wave/10 px-2.5 py-0.5 text-wave">
              Search: &quot;{search}&quot;
              <button type="button" onClick={() => setSearch("")} className="hover:text-white">
                <X size={12} />
              </button>
            </span>
          )}
          {statusFilter !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-wave/30 bg-wave/10 px-2.5 py-0.5 text-wave">
              Status: {statusFilter}
              <button type="button" onClick={() => setStatusFilter("all")} className="hover:text-white">
                <X size={12} />
              </button>
            </span>
          )}
          {phoneFilter !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-0.5 text-sky-300">
              Phone: {phoneFilter === "with" ? "Has phone" : "Missing phone"}
              <button
                type="button"
                onClick={() => {
                  setPhoneFilter("all");
                  if (activeCard === "withPhone") setActiveCard("all");
                }}
                className="hover:text-white"
              >
                <X size={12} />
              </button>
            </span>
          )}
          {addressFilter !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-indigo-400/30 bg-indigo-400/10 px-2.5 py-0.5 text-indigo-300">
              Address: {addressFilter === "with" ? "Has address" : "Missing address"}
              <button
                type="button"
                onClick={() => {
                  setAddressFilter("all");
                  if (activeCard === "withAddress") setActiveCard("all");
                }}
                className="hover:text-white"
              >
                <X size={12} />
              </button>
            </span>
          )}
          {activeCard === "thisMonth" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-emerald-300">
              Joined: This Month
              <button type="button" onClick={() => setActiveCard("all")} className="hover:text-white">
                <X size={12} />
              </button>
            </span>
          )}
          {(dateFrom || dateTo) && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-amber-300">
              Joined: {dateFrom || "Start"} → {dateTo || "End"}
              <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }} className="hover:text-white">
                <X size={12} />
              </button>
            </span>
          )}
          {sortBy !== "newest" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-2.5 py-0.5 text-mist/70">
              Sort: {sortBy === "oldest" ? "Oldest" : sortBy === "name_asc" ? "Name A-Z" : "Name Z-A"}
              <button type="button" onClick={() => setSortBy("newest")} className="hover:text-white">
                <X size={12} />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Table */}
      {customersList.loading ? (
        <div className="flex flex-col gap-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : customersList.error ? (
        <Card className="border-rose-400/30 p-6 text-center text-rose-200">{customersList.error}</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-mist/40">
          <Package size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium text-mist/70">
            {customersList.data?.length === 0
              ? "No customers registered yet."
              : "No customers match the current filter selection."}
          </p>
          {hasActiveFilters && (
            <div className="mt-4">
              <Button variant="ghost" onClick={resetFilters}>
                <RotateCcw size={14} /> Clear all filters
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-white/10 bg-white/5">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-mist/40">Customer</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-mist/40">Email</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-mist/40">Phone</th>
                  <th className="hidden px-4 py-3 text-xs font-semibold uppercase tracking-wide text-mist/40 lg:table-cell">Address</th>
                  <th className="hidden px-4 py-3 text-xs font-semibold uppercase tracking-wide text-mist/40 sm:table-cell">Joined</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <CustomerRow key={c.id} customer={c} onView={() => setSelected(c)} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-white/5 px-4 py-2 text-xs text-mist/30">
            Showing {filtered.length} of {customersList.data?.length ?? 0} customers
            {filtered.length !== (customersList.data?.length ?? 0) ? " (filtered)" : ""}
          </p>
        </Card>
      )}

      <AddCustomerModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => customersList.reload()}
      />

      <CustomerDetailModal
        customer={selected}
        onClose={() => setSelected(null)}
        onUpdated={() => { setSelected(null); customersList.reload(); }}
      />
    </div>
  );
}
