from django.contrib import admin

from .models import LedgerEntry, LedgerSettings, NumberSequence, PaymentAccount


@admin.register(LedgerEntry)
class LedgerEntryAdmin(admin.ModelAdmin):
    """
    Read-only on purpose. A journal is only correct while it stays append-only —
    editing or deleting a row here would desynchronise account_balance with no
    audit trail. Corrections go through the void endpoint, which posts a mirror
    entry instead.
    """

    list_display = (
        'entry_date', 'customer', 'entry_type', 'item_label', 'amount',
        'bottles_out', 'bottles_in', 'balance_after', 'receipt_number',
        'source_ref', 'created_by',
    )
    list_filter = ('entry_type', 'payment_method', 'entry_date')
    search_fields = (
        'customer__username', 'customer__first_name', 'customer__last_name',
        'receipt_number', 'reference', 'description', 'source_ref',
    )
    date_hierarchy = 'entry_date'
    ordering = ('-entry_date', '-id')
    list_select_related = ('customer', 'created_by')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(LedgerSettings)
class LedgerSettingsAdmin(admin.ModelAdmin):
    list_display = ('business_name', 'auto_charge_enabled', 'ledger_start_date')

    def has_add_permission(self, request):
        # Singleton — created on demand by LedgerSettings.load().
        return not LedgerSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(NumberSequence)
class NumberSequenceAdmin(admin.ModelAdmin):
    list_display = ('key', 'year', 'last_number')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PaymentAccount)
class PaymentAccountAdmin(admin.ModelAdmin):
    list_display = ('bank_name', 'account_title', 'account_number', 'iban', 'is_active', 'sort_order')
    list_editable = ('is_active', 'sort_order')
    list_filter = ('is_active', 'bank_name')
    search_fields = ('bank_name', 'account_title', 'account_number', 'iban')
