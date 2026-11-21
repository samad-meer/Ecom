from django.db import models
from django.contrib.auth.models import User
from products.models import Product
from accounts.models import UserProfile
from core.address import PORTION_CHOICES, PORTION_LABELS

class DeliveryStatus(models.Model):
    """Admin-configurable delivery status options"""
    name = models.CharField(max_length=50, unique=True, help_text="Status name (e.g., Delivered, Not Responding)")
    color = models.CharField(max_length=7, default='#007AFF', help_text="Hex color code (e.g., #2ecc71)")
    background_color = models.CharField(max_length=7, default='#f0f8ff', help_text="Background hex color")
    border_color = models.CharField(max_length=7, default='#007AFF', help_text="Border hex color")
    order = models.PositiveIntegerField(default=0, help_text="Display order (lower numbers appear first)")
    is_active = models.BooleanField(default=True, help_text="Whether this status is available for use")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'name']
        verbose_name = 'Delivery Status'
        verbose_name_plural = 'Delivery Statuses'

    def __str__(self):
        return self.name

class Order(models.Model):
    STATUS_CHOICES = (
        ('Pending', 'Pending'),
        ('Processing', 'Processing'),
        ('Shipped', 'Shipped'),
        ('Delivered', 'Delivered'),
        ('Cancelled', 'Cancelled'),
    )

    # Cash on delivery only — the business does not accept mobile wallets.
    PAYMENT_METHOD_CHOICES = (
        ('COD', 'Cash on Delivery'),
    )

    user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='orders'
    )
    # Guest customer fields — used when user is None (phone-in orders with no account)
    guest_name = models.CharField(max_length=150, blank=True, null=True)
    guest_phone = models.CharField(max_length=30, blank=True, null=True)

    total_price = models.DecimalField(max_digits=10, decimal_places=2)

    # ── Discount snapshot (frozen when the order is created/billed) ──────────
    # total_price stays the NET the customer pays, so every existing consumer
    # (ledger sync, admin lists, mobile) keeps working unchanged. These fields
    # record how that net was reached; editing a DiscountCategory later must
    # never change them.
    gross_amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text="Sum of line prices before discount; null on orders that "
                  "predate discounts.",
    )
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_category = models.ForeignKey(
        'accounts.DiscountCategory', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='orders',
        help_text="Reporting link only — the snapshot fields are what billing froze.",
    )
    discount_category_name = models.CharField(max_length=100, blank=True)
    discount_type = models.CharField(max_length=10, blank=True)
    discount_value = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
    )
    discount_overridden = models.BooleanField(
        default=False,
        help_text="True when staff with can_override_discount replaced the "
                  "auto-applied amount; the override is in the activity log.",
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Pending')
    shipping_address = models.TextField(
        help_text="Full delivery address; composed from the structured parts "
                  "below when any of them is set.",
    )
    # ── Structured address parts (composed into `shipping_address`) ──────────
    # Mirrors UserProfile so an order taken over the phone is captured the same
    # way a customer enters their own at signup. Blank on orders that predate
    # the split, which is why `shipping_address` stays the field everything
    # reads — search, PDFs and the rider app all still use it.
    house_number = models.CharField(max_length=50, blank=True, default='')
    portion = models.CharField(
        max_length=50, blank=True, default='', choices=PORTION_CHOICES,
    )
    block = models.CharField(max_length=100, blank=True, default='')
    area = models.CharField(max_length=150, blank=True, default='')
    # ── Delivery pin, snapshotted from the chosen address ────────────────────
    # A snapshot, not a live lookup: editing or deleting an address book entry
    # afterwards must not silently move where a past order was delivered.
    shipping_latitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True,
    )
    shipping_longitude = models.DecimalField(
        max_digits=10, decimal_places=6, null=True, blank=True,
    )
    shipping_label = models.CharField(
        max_length=50, blank=True, default='',
        help_text="Which address book entry this came from (Home, Office…).",
    )
    payment_method = models.CharField(max_length=50, choices=PAYMENT_METHOD_CHOICES, default='COD')
    payment_number = models.CharField(
        max_length=20, blank=True, null=True,
        help_text="Legacy field from when mobile wallets were accepted; unused now that "
                  "the business is cash-only.",
    )
    is_paid = models.BooleanField(default=False)
    is_hidden = models.BooleanField(default=False, help_text="Soft-hide order from default list view")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    # Delivery assignment
    assigned_delivery_boy = models.ForeignKey(
        UserProfile, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='assigned_orders',
        limit_choices_to={'user_type': 'delivery_boy'},
        help_text="Delivery boy assigned to this order"
    )
    delivery_assigned_at = models.DateTimeField(null=True, blank=True)
    delivery_completed_at = models.DateTimeField(null=True, blank=True)
    delivery_notes = models.TextField(blank=True, null=True)
    rider_note = models.TextField(
        blank=True, default='',
        help_text="Staff instruction for the assigned rider ('gate code 4412', "
                  "'collect old dues'). Never shown to the customer, and the "
                  "rider can read but not write it.",
    )
    
    # Delivery tracking fields
    number_of_bottles = models.PositiveIntegerField(default=0, help_text="Number of bottles delivered")
    delivery_status = models.CharField(max_length=50, default='Pending', blank=True, help_text="Delivery completion status - managed via DeliveryStatus model")
    delivery_status_updated_at = models.DateTimeField(null=True, blank=True, help_text="Timestamp when delivery status was first updated from Pending")
    cash_received = models.BooleanField(default=False, help_text="Whether cash was received from customer")
    cash_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Amount of cash received")

    def compose_address(self):
        """Join the structured parts into a single human-readable address line.

        Portion is stored as a key ('first_floor') but written out as its label
        ('1st Floor') — the composed line is what the rider app shows.
        """
        portion = PORTION_LABELS.get(self.portion, self.portion)
        parts = [self.house_number, portion, self.block, self.area]
        return ', '.join(p.strip() for p in parts if p and p.strip())

    def sync_address(self):
        """Refresh `shipping_address` from the parts when any of them is set.

        No-op when every part is blank, so orders created by clients that only
        send a free-text address keep exactly what they sent.
        """
        composed = self.compose_address()
        if composed:
            self.shipping_address = composed
        return self.shipping_address

    def __str__(self):
        name = self.user.username if self.user else (self.guest_name or "Guest")
        return f"Order #{self.id} - {name}"

class CustomerVisit(models.Model):
    """
    Journal of doorstep outcomes that are NOT deliveries: the rider rang the
    bell and the customer said "no need today", or nobody answered.

    Deliberately does NOT touch the order status — the business may re-attempt
    the same order later the same day, and the order keeps moving through its
    normal lifecycle. This table only answers "how often does this customer
    turn us away?" and stops a second rider ringing a bell already marked
    NO RESPONSE an hour ago.
    """

    NO_NEED = 'no_need'
    NO_RESPONSE = 'no_response'
    OUTCOME_CHOICES = [
        (NO_NEED, 'No need today'),
        (NO_RESPONSE, 'No response at the door'),
    ]

    rider = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='customer_visits',
    )
    customer = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='visits',
    )
    # SET_NULL: the journal outlives the order — a customer's refusal history
    # is still meaningful after the order row is gone.
    order = models.ForeignKey(
        Order, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='visits',
    )
    outcome = models.CharField(max_length=12, choices=OUTCOME_CHOICES)
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Customer Visit'
        verbose_name_plural = 'Customer Visits'
        indexes = [
            # Every read is "this customer, most recent first" — the admin
            # journal and the per-order "already marked today" lookup.
            models.Index(fields=['customer', '-created_at'], name='visit_customer_recent_idx'),
        ]

    def __str__(self):
        return f'{self.customer.username} · {self.get_outcome_display()} · {self.created_at:%Y-%m-%d %H:%M}'


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)
    price = models.DecimalField(max_digits=10, decimal_places=2)  # Price at the time of order

    def __str__(self):
        return f"{self.quantity} x {self.product.name}"


class MessageTemplate(models.Model):
    """Admin-customizable message templates for WhatsApp/SMS notifications."""

    CATEGORY_CHOICES = [
        ('order_info', 'Order Info / Confirmation'),
        ('order_dispatch', 'Order Dispatch / On The Way'),
        ('payment_reminder', 'Payment Reminder / Dues'),
        ('custom', 'Custom Message'),
    ]

    name = models.CharField(max_length=120, help_text="Template label, e.g. Standard Dispatch")
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default='order_info')
    content = models.TextField(help_text="Message body with placeholder tags e.g. {customer_name}")
    is_default = models.BooleanField(default=False, help_text="Whether this is the default template for its category")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_default', 'name']

    def __str__(self):
        return f"{self.name} ({self.get_category_display()})"

    def save(self, *args, **kwargs):
        # If this template is marked as default, unset is_default on other templates in the same category
        if self.is_default:
            MessageTemplate.objects.filter(category=self.category).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)


class DeliverySettings(models.Model):
    """Singleton holding delivery & rider configuration."""

    rider_can_call = models.BooleanField(
        default=True,
        help_text="Allow riders to call customers directly from the delivery screen.",
    )
    rider_can_whatsapp = models.BooleanField(
        default=True,
        help_text="Allow riders to open WhatsApp to message customers from the delivery screen.",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Delivery Settings'
        verbose_name_plural = 'Delivery Settings'

    def __str__(self):
        return f"DeliverySettings(call={self.rider_can_call}, whatsapp={self.rider_can_whatsapp})"

    def save(self, *args, **kwargs):
        self.pk = 1  # enforce a single row
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


