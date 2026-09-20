"""
Serializers for the ledger.

Sign convention, stated once because it is the easiest thing to get wrong:

  * STORAGE  — `LedgerEntry.amount` and `UserProfile.account_balance` are
    positive for a credit to the customer, negative when they owe.
  * OUTPUT   — every field named `balance` here is the **amount owed**, i.e. the
    negation. That is how the business reads a statement ("Balance 4,650" means
    the customer owes 4,650), and it matches the existing printed ledger.

`debit` / `credit` are already unsigned, so the UI renders two columns without
doing any sign arithmetic of its own.
"""

from decimal import Decimal

from rest_framework import serializers

from .models import LedgerEntry, LedgerSettings, PaymentAccount

ZERO = Decimal('0')


def owed(stored_balance):
    """Convert a stored balance into the 'what they owe' figure shown to staff."""
    return -(stored_balance or ZERO)


class LedgerEntrySerializer(serializers.ModelSerializer):
    entry_type_display = serializers.CharField(source='get_entry_type_display', read_only=True)
    document_label = serializers.CharField(read_only=True)
    debit = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    credit = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    # Blank/null on rows without a discount — the statement leaves the Gross /
    # Discount columns empty rather than printing 0.00.
    discount_category_name = serializers.CharField(read_only=True)
    source = serializers.CharField(read_only=True)
    is_reversal = serializers.BooleanField(read_only=True)
    is_reversed = serializers.BooleanField(read_only=True)
    can_void = serializers.BooleanField(read_only=True)
    created_by_name = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()

    # Injected by the statement view — the recomputed running total for this
    # row, already in owed-positive terms. Distinct from `balance_after`, which
    # is the frozen snapshot the receipt prints.
    running_balance = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True, required=False,
    )
    stock_after = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = LedgerEntry
        fields = [
            'id', 'entry_date', 'entry_type', 'entry_type_display',
            'description', 'item_label', 'quantity', 'unit_price',
            'document_number', 'document_label',
            'gross_amount', 'discount_amount', 'discount_category_name',
            'amount', 'debit', 'credit', 'running_balance', 'balance_after',
            'bottles_out', 'bottles_in', 'stock_after',
            'payment_method', 'reference', 'receipt_number',
            'source', 'order', 'delivery_record',
            'is_reversal', 'is_reversed', 'can_void', 'void_reason',
            'customer', 'customer_name', 'created_by_name', 'created_at', 'notes',
        ]
        read_only_fields = fields

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return None

    def get_customer_name(self, obj):
        return obj.customer.get_full_name() or obj.customer.username


class RecordPaymentSerializer(serializers.Serializer):
    """Recording a lump-sum payment against a customer's balance."""

    customer_id = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal('0.01'))
    payment_method = serializers.ChoiceField(
        choices=LedgerEntry.PAYMENT_METHODS, default='Cash',
    )
    entry_date = serializers.DateField(required=False, allow_null=True)
    reference = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class ManualEntrySerializer(serializers.Serializer):
    """Opening balance, adjustment or refund, posted by an admin."""

    customer_id = serializers.IntegerField()
    entry_type = serializers.ChoiceField(choices=LedgerEntry.MANUAL_TYPES)
    # Signed: negative charges the customer, positive credits them.
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    description = serializers.CharField(max_length=255)
    entry_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    # Lets an opening entry carry the customer's existing bottle stock.
    bottles_out = serializers.IntegerField(required=False, default=0)
    bottles_in = serializers.IntegerField(required=False, default=0)

    def validate(self, attrs):
        if attrs.get('amount') == ZERO and not attrs.get('bottles_out') and not attrs.get('bottles_in'):
            raise serializers.ValidationError(
                {'amount': 'Provide an amount or a bottle count.'}
            )
        return attrs


class VoidEntrySerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255)


class ReceivableSerializer(serializers.Serializer):
    """One row of the 'who owes money' list."""

    id = serializers.IntegerField()
    username = serializers.CharField()
    name = serializers.CharField()
    customer_code = serializers.CharField(allow_null=True)
    phone = serializers.CharField(allow_null=True)
    address = serializers.CharField(allow_null=True)
    balance = serializers.DecimalField(max_digits=14, decimal_places=2)
    bottles_held = serializers.IntegerField()
    last_entry_date = serializers.DateField(allow_null=True)
    last_payment_date = serializers.DateField(allow_null=True)


class BusinessSettingsSerializer(serializers.ModelSerializer):
    """The admin-editable slice of LedgerSettings exposed over the API.

    Deliberately narrow: the rest of the singleton (ledger kill switches, start
    date) changes how money is posted and stays in the Django admin, behind a
    deploy-level login rather than an app screen.
    """

    class Meta:
        model = LedgerSettings
        fields = (
            'share_location_label',
            'payment_account_title', 'payment_account_number',
            'payment_bank_name', 'payment_qr', 'payment_instructions',
        )


class PaymentAccountSerializer(serializers.ModelSerializer):
    """One account a customer can transfer to.

    `qr` is returned absolute so the mobile app can load it without knowing the
    API host — the same reason the old single-account payload did it.
    """

    qr = serializers.SerializerMethodField()

    class Meta:
        model = PaymentAccount
        fields = [
            'id', 'bank_name', 'account_title', 'account_number', 'iban',
            'qr', 'instructions', 'is_active', 'sort_order',
        ]

    def get_qr(self, obj):
        if not obj.qr:
            return None
        request = self.context.get('request')
        return request.build_absolute_uri(obj.qr.url) if request else obj.qr.url


class PaymentAccountWriteSerializer(serializers.ModelSerializer):
    """Admin create/update. `qr` is a real upload here, not a URL."""

    class Meta:
        model = PaymentAccount
        fields = [
            'id', 'bank_name', 'account_title', 'account_number', 'iban',
            'qr', 'instructions', 'is_active', 'sort_order',
        ]

    def validate(self, attrs):
        # A card with a bank name and nothing to pay into is worse than no card
        # at all — the rider shows it, the customer cannot act on it.
        merged = {**getattr(self.instance, '__dict__', {}), **attrs}
        if not (merged.get('account_number') or merged.get('iban') or merged.get('qr')):
            raise serializers.ValidationError(
                'Give at least an account number, an IBAN, or a QR — otherwise '
                'the customer has nothing to pay into.'
            )
        return attrs
