from django.contrib import admin
from django.utils.html import format_html
from .models import Order, OrderItem, DeliveryStatus, DeliverySettings

@admin.register(DeliverySettings)
class DeliverySettingsAdmin(admin.ModelAdmin):
    list_display = ('id', 'rider_can_call', 'rider_can_whatsapp', 'updated_at')

    def has_add_permission(self, request):
        return not DeliverySettings.objects.exists()

@admin.register(DeliveryStatus)
class DeliveryStatusAdmin(admin.ModelAdmin):
    list_display = ('name', 'color_preview', 'order', 'is_active', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('name',)
    list_editable = ('order', 'is_active')
    ordering = ('order', 'name')
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'is_active', 'order')
        }),
        ('Colors (Hex Codes)', {
            'fields': ('color', 'background_color', 'border_color'),
            'description': 'Use hex color codes like #2ecc71 for green, #e74c3c for red'
        }),
    )
    
    def color_preview(self, obj):
        return format_html(
            '<div style="background-color: {}; color: {}; border: 2px solid {}; '
            'padding: 5px 10px; border-radius: 5px; display: inline-block;">{}</div>',
            obj.background_color, obj.color, obj.border_color, obj.name
        )
    color_preview.short_description = 'Preview'

class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ('product', 'quantity', 'price')

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'total_price', 'status', 'is_pinned', 'assigned_delivery_boy', 
                   'show_to_rider', 'delivery_status', 'created_at', 'is_paid')
    list_filter = ('is_pinned', 'show_to_rider', 'status', 'is_paid', 'created_at', 'assigned_delivery_boy')
    search_fields = ('user__username', 'user__email', 'shipping_address', 'id')
    list_editable = ('status', 'is_paid', 'is_pinned', 'show_to_rider')
    # The discount snapshot was frozen at billing time; editing it here would
    # desync the receipt from what was actually charged.
    readonly_fields = ('created_at', 'updated_at', 'delivery_assigned_at', 'delivery_completed_at',
                       'gross_amount', 'discount_amount', 'discount_category',
                       'discount_category_name', 'discount_type', 'discount_value',
                       'discount_overridden')
    inlines = [OrderItemInline]

    fieldsets = (
        ('Order Information', {
            'fields': ('user', 'total_price', 'status', 'is_paid')
        }),
        ('Discount (frozen at billing)', {
            'fields': ('gross_amount', 'discount_amount', 'discount_category',
                       'discount_category_name', 'discount_type', 'discount_value',
                       'discount_overridden'),
            'classes': ('collapse',)
        }),
        ('Shipping & Payment', {
            'fields': ('shipping_address', 'payment_method', 'payment_number')
        }),
        ('Delivery Assignment', {
            'fields': ('assigned_delivery_boy', 'delivery_assigned_at', 
                      'delivery_completed_at', 'delivery_notes'),
            'classes': ('collapse',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        # Editing status or total here must move the ledger too, otherwise the
        # admin becomes a way to change money without an audit trail.
        from ledger.service import sync_order
        sync_order(obj, actor=request.user)

    def delivery_status(self, obj):
        if obj.assigned_delivery_boy:
            if obj.delivery_completed_at:
                return format_html('<span style="color: green;">✅ Delivered</span>')
            elif obj.delivery_assigned_at:
                return format_html('<span style="color: orange;">🚚 In Progress</span>')
            else:
                return format_html('<span style="color: blue;">📋 Assigned</span>')
        else:
            return format_html('<span style="color: gray;">⏳ Pending</span>')
    delivery_status.short_description = 'Delivery Status'

@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = ('order', 'product', 'quantity', 'price')
    list_filter = ('order__status',)
    search_fields = ('product__name', 'order__id')