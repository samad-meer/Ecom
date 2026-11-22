"""Admin dashboard period filtering, and the split delivery address on orders."""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework import status as http
from rest_framework.test import APIClient

from products.models import Product
from .models import Order

SUMMARY_URL = '/api/orders/admin/summary/'
ADMIN_ORDERS_URL = '/api/orders/admin/'


class AdminSummaryPeriodTests(TestCase):
    """`date_from` / `date_to` scope every figure; omitting them keeps all-time."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='dashadmin', password='AdminPass1!', is_staff=True,
        )
        self.client.force_authenticate(self.admin)

        today = timezone.now()
        # One order today, one 10 days back, so a "this month" style window can
        # include both while a "today" window includes only the first.
        self.today_order = self._order(Decimal('500.00'), today)
        self.old_order = self._order(Decimal('300.00'), today - timedelta(days=10))

    def _order(self, total, when):
        order = Order.objects.create(
            shipping_address='H-1, Ground, Block 2, Johar Town',
            total_price=total,
            status='Pending',
        )
        # created_at is auto_now_add, so it has to be forced afterwards.
        Order.objects.filter(pk=order.pk).update(created_at=when)
        order.refresh_from_db()
        return order

    def test_unscoped_summary_is_all_time(self):
        res = self.client.get(SUMMARY_URL)
        self.assertEqual(res.status_code, http.HTTP_200_OK)
        self.assertEqual(res.data['total'], 2)
        self.assertEqual(res.data['revenue'], 800.0)

    def test_range_scopes_counts_and_revenue(self):
        # localdate(), not now().date() — the range is expressed in local dates.
        today = timezone.localdate().isoformat()
        res = self.client.get(SUMMARY_URL, {'date_from': today, 'date_to': today})
        self.assertEqual(res.status_code, http.HTTP_200_OK)
        self.assertEqual(res.data['total'], 1)
        self.assertEqual(res.data['revenue'], 500.0)
        self.assertEqual(res.data['pending'], 1)

    def test_today_figures_ignore_the_selected_range(self):
        """today_* is a fixed reference point, not part of the chosen window."""
        old_day = (timezone.localdate() - timedelta(days=10)).isoformat()
        res = self.client.get(SUMMARY_URL, {'date_from': old_day, 'date_to': old_day})
        self.assertEqual(res.data['total'], 1)
        self.assertEqual(res.data['revenue'], 300.0)
        # Still reports today's own numbers alongside the older window.
        self.assertEqual(res.data['today_orders'], 1)
        self.assertEqual(res.data['today_revenue'], 500.0)

    def test_malformed_date_is_rejected(self):
        res = self.client.get(SUMMARY_URL, {'date_from': 'last-tuesday'})
        self.assertEqual(res.status_code, http.HTTP_400_BAD_REQUEST)
        self.assertIn('date_from', res.data)

    def test_reversed_range_is_rejected(self):
        res = self.client.get(
            SUMMARY_URL, {'date_from': '2026-08-04', 'date_to': '2026-08-01'},
        )
        self.assertEqual(res.status_code, http.HTTP_400_BAD_REQUEST)

    def test_non_staff_is_denied(self):
        self.client.force_authenticate(
            User.objects.create_user(username='nobody', password='NoPass1!')
        )
        res = self.client.get(SUMMARY_URL)
        self.assertIn(
            res.status_code,
            (http.HTTP_403_FORBIDDEN, http.HTTP_401_UNAUTHORIZED),
        )


class AdminOrderAddressPartsTests(TestCase):
    """Orders take the address in parts, mirroring signup, and compose them."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='orderadmin', password='AdminPass1!', is_staff=True,
        )
        self.client.force_authenticate(self.admin)
        self.product = Product.objects.create(
            name='19L Bottle', price=Decimal('150.00'),
        )

    def _payload(self, **overrides):
        payload = {
            'guest_name': 'Walk-in',
            'payment_method': 'COD',
            'items': [{'product_id': self.product.id, 'quantity': 2}],
        }
        payload.update(overrides)
        return payload

    def test_parts_compose_into_shipping_address(self):
        res = self.client.post(
            ADMIN_ORDERS_URL,
            self._payload(
                house_number='H-12', portion='first_floor',
                block='Block 6', area='Johar Town',
            ),
            format='json',
        )
        self.assertEqual(res.status_code, http.HTTP_201_CREATED, res.data)
        order = Order.objects.get(pk=res.data['id'])
        self.assertEqual(order.house_number, 'H-12')
        self.assertEqual(order.area, 'Johar Town')
        # Stored as the key, written into the address line as the label.
        self.assertEqual(order.portion, 'first_floor')
        self.assertEqual(
            order.shipping_address, 'H-12, 1st Floor, Block 6, Johar Town',
        )

    def test_free_text_portion_is_normalised_to_a_key(self):
        """Older clients send 'Ground'; it must land on the canonical value."""
        res = self.client.post(
            ADMIN_ORDERS_URL,
            self._payload(
                house_number='H-12', portion='Ground floor', area='Johar Town',
            ),
            format='json',
        )
        self.assertEqual(res.status_code, http.HTTP_201_CREATED, res.data)
        order = Order.objects.get(pk=res.data['id'])
        self.assertEqual(order.portion, 'ground')
        self.assertEqual(order.shipping_address, 'H-12, Ground, Johar Town')

    def test_unrecognised_portion_is_dropped_not_guessed(self):
        res = self.client.post(
            ADMIN_ORDERS_URL,
            self._payload(
                house_number='H-12', portion='near the tree', area='Johar Town',
            ),
            format='json',
        )
        self.assertEqual(res.status_code, http.HTTP_201_CREATED, res.data)
        order = Order.objects.get(pk=res.data['id'])
        self.assertEqual(order.portion, '')
        self.assertEqual(order.shipping_address, 'H-12, Johar Town')

    def test_optional_parts_may_be_omitted(self):
        res = self.client.post(
            ADMIN_ORDERS_URL,
            self._payload(house_number='H-12', area='Johar Town'),
            format='json',
        )
        self.assertEqual(res.status_code, http.HTTP_201_CREATED, res.data)
        order = Order.objects.get(pk=res.data['id'])
        self.assertEqual(order.shipping_address, 'H-12, Johar Town')

    def test_area_is_required_once_any_part_is_used(self):
        res = self.client.post(
            ADMIN_ORDERS_URL, self._payload(house_number='H-12'), format='json',
        )
        self.assertEqual(res.status_code, http.HTTP_400_BAD_REQUEST)
        self.assertIn('area', res.data)

    def test_house_is_required_once_any_part_is_used(self):
        res = self.client.post(
            ADMIN_ORDERS_URL, self._payload(area='Johar Town'), format='json',
        )
        self.assertEqual(res.status_code, http.HTTP_400_BAD_REQUEST)
        self.assertIn('house_number', res.data)

    def test_legacy_single_address_still_accepted(self):
        """Older mobile builds send only shipping_address; they must keep working."""
        res = self.client.post(
            ADMIN_ORDERS_URL,
            self._payload(shipping_address='H-9, Model Town'),
            format='json',
        )
        self.assertEqual(res.status_code, http.HTTP_201_CREATED, res.data)
        order = Order.objects.get(pk=res.data['id'])
        self.assertEqual(order.shipping_address, 'H-9, Model Town')
        self.assertEqual(order.house_number, '')

    def test_address_is_required_somehow(self):
        res = self.client.post(ADMIN_ORDERS_URL, self._payload(), format='json')
        self.assertEqual(res.status_code, http.HTTP_400_BAD_REQUEST)
        self.assertIn('shipping_address', res.data)


class AdminOrderEditTests(TestCase):
    """Admin can edit order details (items, address, customer details, notes)."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='editadmin', password='AdminPass1!', is_staff=True,
        )
        self.client.force_authenticate(self.admin)
        self.p1 = Product.objects.create(name='19L Bottle', price=Decimal('150.00'), is_active=True)
        self.p2 = Product.objects.create(name='Dispenser', price=Decimal('500.00'), is_active=True)

        res = self.client.post(
            ADMIN_ORDERS_URL,
            {
                'guest_name': 'Original Customer',
                'guest_phone': '03001234567',
                'house_number': '123',
                'area': 'Gulberg',
                'payment_method': 'COD',
                'items': [{'product_id': self.p1.id, 'quantity': 2}],
            },
            format='json',
        )
        self.assertEqual(res.status_code, http.HTTP_201_CREATED)
        self.order_id = res.data['id']
        self.update_url = f'/api/orders/admin/{self.order_id}/'

    def test_edit_order_items_recalculates_total(self):
        # Change to 1 bottle + 1 dispenser = 150 + 500 = 650
        res = self.client.patch(
            self.update_url,
            {
                'items': [
                    {'product_id': self.p1.id, 'quantity': 1},
                    {'product_id': self.p2.id, 'quantity': 1},
                ],
            },
            format='json',
        )
        self.assertEqual(res.status_code, http.HTTP_200_OK, res.data)
        order = Order.objects.get(pk=self.order_id)
        self.assertEqual(order.total_price, Decimal('650.00'))
        self.assertEqual(order.items.count(), 2)
        quantities = {item.product_id: item.quantity for item in order.items.all()}
        self.assertEqual(quantities, {self.p1.id: 1, self.p2.id: 1})

    def test_edit_order_address(self):
        res = self.client.patch(
            self.update_url,
            {
                'house_number': '456',
                'portion': 'first_floor',
                'block': 'Block B',
                'area': 'Model Town',
            },
            format='json',
        )
        self.assertEqual(res.status_code, http.HTTP_200_OK, res.data)
        order = Order.objects.get(pk=self.order_id)
        self.assertEqual(order.house_number, '456')
        self.assertEqual(order.portion, 'first_floor')
        self.assertEqual(order.shipping_address, '456, 1st Floor, Block B, Model Town')

    def test_edit_guest_customer_details(self):
        res = self.client.patch(
            self.update_url,
            {
                'guest_name': 'Changed Customer Name',
                'guest_phone': '03119876543',
            },
            format='json',
        )
        self.assertEqual(res.status_code, http.HTTP_200_OK, res.data)
        order = Order.objects.get(pk=self.order_id)
        self.assertEqual(order.guest_name, 'Changed Customer Name')
        self.assertEqual(order.guest_phone, '03119876543')

