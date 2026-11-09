import re
from collections import defaultdict
from decimal import Decimal
from rest_framework import serializers
from django.contrib.auth.models import User
from django.db.models import Max, Sum
from django.utils import timezone
from accounts.models import DiscountCategory
from .models import Order, OrderItem, DeliveryStatus, CustomerVisit
from core.timeframes import on_local_day
from core.address import normalize_portion
from accounts.models import CustomerAddress
from products.serializers import ProductSerializer
from products.models import Product

ZERO = Decimal('0.00')

#: The frozen snapshot every order carries; read-only on every serializer —
#: clients can never supply discount amounts, billing computes them.
DISCOUNT_SNAPSHOT_FIELDS = [
    'gross_amount', 'discount_amount', 'discount_category_name',
    'discount_type', 'discount_value',
]


def discount_snapshot(user, lines):
    """
    Freeze the billing-time discount for an order.

    `lines` is [(quantity, unit_price), ...], one per order item. Fixed
    discounts are per unit; percentage discounts are taken per line, rounded
    HALF_UP to 2 dp, then summed — a line can never go below zero. The result
    is stored on the order so later category edits change nothing here.
    """
    gross = sum((Decimal(q) * Decimal(p) for q, p in lines), Decimal('0'))
    category = DiscountCategory.for_customer(user)
    if category is None:
        return {
            'gross_amount': gross, 'discount_amount': ZERO,
            'discount_category': None, 'discount_category_name': '',
            'discount_type': '', 'discount_value': None,
        }
    return {
        'gross_amount': gross,
        'discount_amount': sum(
            (category.line_discount(q, p) for q, p in lines), Decimal('0')
        ),
        'discount_category': category,
        'discount_category_name': category.name,
        'discount_type': category.discount_type,
        'discount_value': category.discount_value,
    }


class DeliveryStatusSerializer(serializers.ModelSerializer):
    """What the rider app reads. `is_active` is absent on purpose — the rider
    list is already filtered to active ones, so sending it would only invite a
    client to render a status it must never offer."""

    class Meta:
        model = DeliveryStatus
        fields = ['id', 'name', 'color', 'background_color', 'border_color', 'order']


class AdminDeliveryStatusSerializer(serializers.ModelSerializer):
    """The staff-managed view: everything above plus the on/off switch.

    Retiring a status is `is_active = False`, not a delete: orders record the
    status by *name*, so removing the row would leave historic deliveries
    labelled with something no longer explicable.
    """

    class Meta:
        model = DeliveryStatus
        fields = [
            'id', 'name', 'color', 'background_color', 'border_color',
            'order', 'is_active',
        ]

    def validate_name(self, value):
        name = (value or '').strip()
        if not name:
            raise serializers.ValidationError('A status needs a name.')
        return name

    def _validate_hex(self, value, field):
        colour = (value or '').strip()
        if not re.fullmatch(r'#[0-9A-Fa-f]{6}', colour):
            raise serializers.ValidationError(
                f'{field} must be a 6-digit hex colour like #2ecc71.'
            )
        return colour

    def validate_color(self, value):
        return self._validate_hex(value, 'Text colour')

    def validate_background_color(self, value):
        return self._validate_hex(value, 'Background colour')

    def validate_border_color(self, value):
        return self._validate_hex(value, 'Border colour')

class OrderItemSerializer(serializers.ModelSerializer):
    product_details = ProductSerializer(source='product', read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(), source='product', write_only=True
    )

    class Meta:
        model = OrderItem
        fields = ['id', 'product_id', 'product_details', 'quantity', 'price']

class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True)
    user = serializers.ReadOnlyField(source='user.username')
    assigned_delivery_boy_name = serializers.SerializerMethodField()
    # Checkout sends the chosen address book entry; everything about it is
    # copied onto the order rather than referenced, so editing or deleting the
    # entry later cannot change where a past order was delivered.
    address_id = serializers.IntegerField(write_only=True, required=False)

    class Meta:
        model = Order
        # The discount snapshot is the customer's own receipt breakdown
        # (gross / discount / net), so it IS visible here. Their category
        # ASSIGNMENT (UserProfile.discount_category) never is.
        fields = ['id', 'user', 'items', 'total_price', 'status', 'shipping_address',
                  'address_id', 'house_number', 'portion', 'block', 'area',
                  'shipping_latitude', 'shipping_longitude', 'shipping_label',
                  'payment_method', 'payment_number', 'is_paid', 'created_at',
                  # `delivery_notes` is deliberately absent: it is an internal
                  # instruction between the office and the rider ("gate code
                  # 1234", "call before entering", "customer disputes the last
                  # bottle count"), not something the customer is meant to read
                  # back. The rider and admin serializers below add it. Same
                  # rule as rider_note.
                  'assigned_delivery_boy', 'assigned_delivery_boy_name',
                  'delivery_assigned_at', 'delivery_completed_at',
                  'number_of_bottles', 'delivery_status', 'delivery_status_updated_at',
                  'cash_received', 'cash_amount'] + DISCOUNT_SNAPSHOT_FIELDS
        # total_price is server-computed at checkout (gross − auto discount);
        # a client-sent total or discount amount is silently dropped.
        read_only_fields = ['status', 'created_at', 'user', 'is_paid',
                            'delivery_status_updated_at', 'total_price'] \
            + DISCOUNT_SNAPSHOT_FIELDS
        extra_kwargs = {
            # Optional at the field level because checkout normally sends only
            # address_id and create() fills this in from the saved address.
            # validate() below still insists on one of the two.
            'shipping_address': {'required': False, 'allow_blank': True},
        }

    def validate(self, attrs):
        # Creation only. Subclasses use this serializer for updates too — a
        # rider marking an order delivered sends nothing but a status, and
        # demanding the address back would reject every one of those PATCHes.
        if self.instance is not None:
            return attrs
        if not attrs.get('address_id') and not (attrs.get('shipping_address') or '').strip():
            raise serializers.ValidationError({
                'shipping_address': 'Choose a saved address or provide one.'
            })
        return attrs

    def get_assigned_delivery_boy_name(self, obj):
        if obj.assigned_delivery_boy:
            return obj.assigned_delivery_boy.user.get_full_name() or obj.assigned_delivery_boy.user.username
        return None

    def validate_address_id(self, value):
        """Resolve to one of the requesting customer's own addresses."""
        user = self.context['request'].user
        try:
            return CustomerAddress.objects.get(pk=value, user=user)
        except CustomerAddress.DoesNotExist:
            raise serializers.ValidationError('No such address on your account.')

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        address = validated_data.pop('address_id', None)
        if address is not None:
            # Snapshot every field, overriding anything the client also sent —
            # the saved address is the authority once one is chosen.
            validated_data.update({
                'shipping_address': address.address,
                'house_number': address.house_number,
                'portion': address.portion,
                'block': address.block,
                'area': address.area,
                'shipping_latitude': address.latitude,
                'shipping_longitude': address.longitude,
                'shipping_label': address.display_label,
            })
        # Billing: the discount comes from the customer's assigned category,
        # never from the request payload.
        snapshot = discount_snapshot(
            validated_data.get('user'),
            [(item['quantity'], item['price']) for item in items_data],
        )
        order = Order.objects.create(
            total_price=snapshot['gross_amount'] - snapshot['discount_amount'],
            **snapshot, **validated_data,
        )
        for item_data in items_data:
            OrderItem.objects.create(order=order, **item_data)
        return order


class DeliveryBoyOrderSerializer(OrderSerializer):
    """
    The assigned rider's view of an order: everything the customer sees plus
    the staff rider_note, the delivery_notes the office left for this drop,
    today's visit journal, and a customer card with what the rider needs at the
    door. rider_note is read-only here — only staff write it, and the customer
    serializer above omits both note fields entirely.

    delivery_notes stays writable: the rider types what happened at the door
    ("left with guard") when they close the delivery.
    """

    customer = serializers.SerializerMethodField()
    today_visits = serializers.SerializerMethodField()
    online_claim = serializers.SerializerMethodField()

    class Meta(OrderSerializer.Meta):
        fields = OrderSerializer.Meta.fields + [
            'delivery_notes', 'rider_note', 'customer', 'today_visits',
            'online_claim',
        ]
        read_only_fields = OrderSerializer.Meta.read_only_fields + ['rider_note']

    def _maps(self, obj):
        maps = self.context.get('rider_card_maps')
        if maps is None:
            # Detail view / update echo: a single order computes its own maps.
            # The list view always passes them in via context instead.
            maps = rider_card_maps([obj])
        return maps

    def get_customer(self, obj):
        if not obj.user_id:
            # Guest phone-in order — no account, so no code/balance/history.
            return {
                'id': None,
                'customer_code': None,
                'name': obj.guest_name or 'Guest',
                'phone_number': obj.guest_phone,
                'address': obj.shipping_address,
                'area': None,
                'account_balance': None,
                'online_waiting': None,
                'bottles_held': 0,
                'last_delivery_days': None,
                'customer_latitude': None,
                'customer_longitude': None,
            }

        maps = self._maps(obj)
        user = obj.user
        profile = getattr(user, 'profile', None)

        last_dates = [
            d for d in (
                maps['last_shop_delivery'].get(user.id),
                maps['last_plant_delivery'].get(user.id),
            ) if d
        ]
        online_waiting = maps['online_waiting'].get(user.id, ZERO)
        return {
            'id': user.id,
            'customer_code': profile.customer_code if profile else None,
            'name': user.get_full_name() or user.username,
            'phone_number': profile.phone_number if profile else None,
            'address': (profile.address if profile else None) or obj.shipping_address,
            'area': profile.area if profile else None,
            # Owed-positive string — the receivables convention, because this
            # is the figure the rider asks for at the door. Online payments
            # still waiting for the office are left out, so the next rider does
            # not ask for the same money again. Once the office marks one Not
            # Found it is due again and the rider collects it.
            'account_balance': (
                str((ZERO - (profile.account_balance or 0) - online_waiting).quantize(ZERO))
                if profile else None
            ),
            'online_waiting': str(online_waiting.quantize(ZERO)),
            'bottles_held': maps['bottles_held'].get(user.id, 0),
            'last_delivery_days': (
                (timezone.localdate() - max(last_dates)).days if last_dates else None
            ),
            # Numbers, not strings — a Google Maps LatLngLiteral needs numbers.
            'customer_latitude': (
                float(profile.customer_latitude)
                if profile and profile.customer_latitude is not None else None
            ),
            'customer_longitude': (
                float(profile.customer_longitude)
                if profile and profile.customer_longitude is not None else None
            ),
        }

    def get_online_claim(self, obj):
        """What became of an Online tap on this delivery, for the locked screen."""
        claim = self._maps(obj)['online_claims'].get(obj.id)
        if claim is None:
            return None
        return {'amount': str(claim.amount), 'status': claim.status}

    def get_today_visits(self, obj):
        """Today's NO NEED / NO RESPONSE marks, so the app can show
        "already marked NO RESPONSE at 10:42" instead of a second doorbell."""
        return [
            {
                'id': visit.id,
                'outcome': visit.outcome,
                'note': visit.note,
                'created_at': visit.created_at.isoformat(),
            }
            for visit in self._maps(obj)['today_visits'].get(obj.id, [])
        ]


def rider_card_maps(orders):
    """
    Batch lookups behind the rider's customer card — one query per fact for a
    whole page of orders, never one per order. Handed to
    DeliveryBoyOrderSerializer via context {'rider_card_maps': ...}.
    """
    from ledger.models import LedgerEntry, PaymentClaim  # local imports keep orders import-light
    from plant.models import DeliveryRecord

    user_ids = {order.user_id for order in orders if order.user_id}
    order_ids = [order.id for order in orders]

    bottles_held = {
        row['customer_id']: int((row['out'] or 0) - (row['inn'] or 0))
        for row in LedgerEntry.objects.filter(customer_id__in=user_ids)
        .values('customer_id')
        .annotate(out=Sum('bottles_out'), inn=Sum('bottles_in'))
    }
    last_shop = {
        row['user_id']: timezone.localtime(row['last']).date()
        for row in Order.objects.filter(user_id__in=user_ids, status='Delivered')
        .values('user_id').annotate(last=Max('created_at'))
    }
    last_plant = {
        row['customer_id']: row['last']
        for row in DeliveryRecord.objects.filter(customer_id__in=user_ids)
        .values('customer_id').annotate(last=Max('date'))
    }
    today_visits = defaultdict(list)
    for visit in (
        on_local_day(
            CustomerVisit.objects.filter(order_id__in=order_ids), 'created_at',
        ).order_by('created_at')
    ):
        today_visits[visit.order_id].append(visit)
    online_waiting = {
        row['customer_id']: row['total']
        for row in PaymentClaim.objects.filter(
            customer_id__in=user_ids, status=PaymentClaim.WAITING,
        ).values('customer_id').annotate(total=Sum('amount'))
    }
    online_claims = {
        claim.order_id: claim
        for claim in PaymentClaim.objects.filter(order_id__in=order_ids)
    }

    return {
        'bottles_held': bottles_held,
        'last_shop_delivery': last_shop,
        'last_plant_delivery': last_plant,
        'today_visits': today_visits,
        'online_waiting': online_waiting,
        'online_claims': online_claims,
    }


class CustomerVisitSerializer(serializers.ModelSerializer):
    """One journal row, as both the rider echo and the staff list return it."""

    rider_name = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = CustomerVisit
        fields = [
            'id', 'order', 'customer', 'customer_name',
            'rider', 'rider_name', 'outcome', 'note', 'created_at',
        ]

    def get_rider_name(self, obj):
        return obj.rider.get_full_name() or obj.rider.username

    def get_customer_name(self, obj):
        return obj.customer.get_full_name() or obj.customer.username


class RiderVisitInputSerializer(serializers.Serializer):
    """
    What the NO NEED / NO RESPONSE buttons send. Deliberately has no rider
    field: the rider is always request.user, and the customer comes from the
    order, so one rider can never journal in another's name.
    """

    order = serializers.IntegerField()
    outcome = serializers.ChoiceField(choices=CustomerVisit.OUTCOME_CHOICES)
    note = serializers.CharField(
        required=False, allow_blank=True, max_length=255, default='',
    )


class AdminOrderSerializer(OrderSerializer):
    """Extended read serializer for staff — includes customer contact details and account balance."""
    customer_name = serializers.SerializerMethodField()
    customer_email = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    customer_balance = serializers.SerializerMethodField()

    class Meta(OrderSerializer.Meta):
        fields = OrderSerializer.Meta.fields + [
            'guest_name', 'guest_phone', 'is_hidden', 'delivery_notes', 'rider_note',
            'customer_name', 'customer_email', 'customer_phone', 'customer_balance',
            'discount_category', 'discount_overridden',
        ]
        read_only_fields = OrderSerializer.Meta.read_only_fields + [
            'discount_category', 'discount_overridden',
        ]

    def get_customer_name(self, obj):
        if obj.user:
            return obj.user.get_full_name() or obj.user.username
        return obj.guest_name or "Guest"

    def get_customer_email(self, obj):
        return obj.user.email if obj.user else None

    def get_customer_phone(self, obj):
        if obj.user:
            try:
                return obj.user.profile.phone_number
            except Exception:
                return None
        return obj.guest_phone

    def get_customer_balance(self, obj):
        if obj.user:
            try:
                return float(obj.user.profile.account_balance)
            except Exception:
                return None
        return None


class AdminOrderUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = [
            'status', 'is_paid', 'is_hidden',
            'assigned_delivery_boy', 'delivery_notes', 'rider_note',
            'cash_amount', 'cash_received',
            'delivery_status',          # staff can override anytime — lock only applies to rider mobile app
        ]

    def update(self, instance, validated_data):
        new_cash = validated_data.get('cash_amount')
        if new_cash is not None and instance.user_id:
            # Auto-resolve is_paid unless the caller explicitly set it
            if 'is_paid' not in validated_data:
                validated_data['is_paid'] = new_cash >= instance.total_price
            if 'cash_received' not in validated_data:
                validated_data['cash_received'] = new_cash > 0

        order = super().update(instance, validated_data)

        # The balance is no longer nudged by hand here. ledger.service owns
        # account_balance and posts a journal entry for the charge and the cash,
        # so the two can never drift apart.
        from ledger.service import sync_order
        sync_order(order, actor=self.context.get('request').user
                   if self.context.get('request') else None)
        return order


class AdminOrderItemInputSerializer(serializers.Serializer):
    product_id = serializers.PrimaryKeyRelatedField(queryset=Product.objects.filter(is_active=True))
    quantity = serializers.IntegerField(min_value=1)


class AdminOrderCreateSerializer(serializers.ModelSerializer):
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source='user', required=False, allow_null=True
    )
    items = AdminOrderItemInputSerializer(many=True, write_only=True)
    # Declared explicitly so it stays a plain string field: the model's choices
    # would otherwise make DRF reject 'Ground' outright, when normalising it to
    # the canonical key is both kinder and still gives clean stored data.
    portion = serializers.CharField(
        required=False, allow_blank=True, default='', max_length=50,
    )
    # Only honoured for staff holding can_override_discount — the view 403s
    # anyone else before this serializer ever runs.
    discount_override = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal('0'),
        required=False, allow_null=True, write_only=True,
    )

    class Meta:
        model = Order
        fields = [
            'user_id', 'guest_name', 'guest_phone',
            'shipping_address', 'house_number', 'portion', 'block', 'area',
            'shipping_latitude', 'shipping_longitude', 'shipping_label',
            'payment_method', 'payment_number',
            'assigned_delivery_boy', 'delivery_notes', 'rider_note',
            'status', 'items', 'discount_override',
        ]
        extra_kwargs = {
            'status': {'default': 'Processing'},
            # Not required on its own any more — a client may send the
            # structured parts instead and validate() composes them into it.
            'shipping_address': {'required': False, 'allow_blank': True},
        }

    def validate(self, attrs):
        """Compose the address parts, mirroring what signup requires.

        House and area are mandatory once any part is used, exactly as on the
        customer signup form. A client that sends only a free-text
        `shipping_address` still works, which is what keeps older builds of the
        mobile app creating orders.
        """
        parts = {
            key: (attrs.get(key) or '').strip()
            for key in ('house_number', 'portion', 'block', 'area')
        }
        parts['portion'] = normalize_portion(parts['portion'])
        if any(parts.values()):
            missing = {
                key: 'This field is required.'
                for key in ('house_number', 'area') if not parts[key]
            }
            if missing:
                raise serializers.ValidationError(missing)
            attrs.update(parts)
            attrs['shipping_address'] = Order(**parts).compose_address()
        elif not (attrs.get('shipping_address') or '').strip():
            raise serializers.ValidationError(
                {'shipping_address': 'A delivery address is required.'}
            )
        return attrs

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        override = validated_data.pop('discount_override', None)
        # Selling prices stay fixed; the discount is its own line, derived from
        # the customer's category and frozen onto the order right here.
        snapshot = discount_snapshot(
            validated_data.get('user'),
            [(item['quantity'], item['product_id'].price) for item in items_data],
        )
        auto_discount = snapshot['discount_amount']
        if override is not None:
            snapshot['discount_amount'] = min(override, snapshot['gross_amount'])
            snapshot['discount_overridden'] = True

        order = Order.objects.create(
            total_price=snapshot['gross_amount'] - snapshot['discount_amount'],
            **snapshot, **validated_data,
        )
        for item in items_data:
            OrderItem.objects.create(
                order=order,
                product=item['product_id'],
                quantity=item['quantity'],
                price=item['product_id'].price,
            )
        # For the view's mandatory override audit trail.
        order._auto_discount_amount = auto_discount if override is not None else None
        return order
