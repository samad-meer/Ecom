from django.urls import path
from .views import (
    OrderListCreateView,
    OrderDetailView,
    DeliveryBoyOrderListView,
    DeliveryBoyOrderDetailView,
    RiderVisitCreateView,
    delivery_boy_stats,
    update_availability,
    delivery_status_list,
    AdminDeliveryStatusListCreateView,
    AdminDeliveryStatusDetailView,
    AdminOrderListView,
    AdminOrderUpdateView,
    AdminOrderSummaryView,
    AdminVisitListView,
    DeliveryBoyListView,
    address_suggestions,
    customer_order_stats,
    MessageTemplateListCreateView,
    MessageTemplateDetailView,
    MessageTemplateSetDefaultView,
    DeliverySettingsView,
)

urlpatterns = [
    path('', OrderListCreateView.as_view(), name='order-list-create'),
    path('<int:id>/', OrderDetailView.as_view(), name='order-detail'),

    # Delivery boy endpoints
    path('delivery/orders/', DeliveryBoyOrderListView.as_view(), name='delivery-orders'),
    path('delivery/orders/<int:id>/', DeliveryBoyOrderDetailView.as_view(), name='delivery-order-detail'),
    path('delivery/visits/', RiderVisitCreateView.as_view(), name='delivery-visit-create'),
    path('delivery/stats/', delivery_boy_stats, name='delivery-stats'),
    path('delivery/availability/', update_availability, name='delivery-availability'),
    path('delivery/statuses/', delivery_status_list, name='delivery-status-list'),
    path('delivery/settings/', DeliverySettingsView.as_view(), name='delivery-settings'),

    # Message templates (WhatsApp / SMS)
    path('templates/', MessageTemplateListCreateView.as_view(), name='message-templates'),
    path('templates/<int:pk>/', MessageTemplateDetailView.as_view(), name='message-template-detail'),
    path('templates/<int:pk>/set-default/', MessageTemplateSetDefaultView.as_view(), name='message-template-set-default'),

    # Staff / admin endpoints (must come before <int:id> catch-all)
    path('admin/summary/', AdminOrderSummaryView.as_view(), name='admin-order-summary'),
    path('admin/visits/', AdminVisitListView.as_view(), name='admin-visit-list'),
    path('admin/delivery-statuses/', AdminDeliveryStatusListCreateView.as_view(), name='admin-delivery-status-list'),
    path('admin/delivery-statuses/<int:pk>/', AdminDeliveryStatusDetailView.as_view(), name='admin-delivery-status-detail'),
    path('admin/delivery-boys/', DeliveryBoyListView.as_view(), name='admin-delivery-boys'),
    path('admin/address-suggestions/', address_suggestions, name='admin-address-suggestions'),
    path('admin/customer-stats/<int:user_id>/', customer_order_stats, name='admin-customer-stats'),
    path('admin/delivery-settings/', DeliverySettingsView.as_view(), name='admin-delivery-settings'),
    path('admin/', AdminOrderListView.as_view(), name='admin-order-list'),
    path('admin/<int:id>/', AdminOrderUpdateView.as_view(), name='admin-order-update'),
]
