"""
Phase 3: the live paths that post to the ledger automatically.

Covers the two gaps that existed before: rider-collected cash never reaching the
balance, and no debit side at all.
"""

from decimal import Decimal

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import UserProfile
from orders.models import Order, OrderItem
from plant.models import BottleType, CustomerType, DeliveryRecord
from products.models import Product

from .models import LedgerEntry, LedgerSettings
from .tests import LedgerTestMixin


class OrderLedgerWiringTests(LedgerTestMixin, TestCase):

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.rider = self.other
        self.rider.profile.user_type = 'delivery_boy'
        self.rider.profile.save()

        self.product = Product.objects.create(name='19L Refill', price=Decimal('150.00'))
        self.order = Order.objects.create(
            user=self.customer, total_price=Decimal('300.00'),
            shipping_address='H-12', status='Processing',
            number_of_bottles=2, assigned_delivery_boy=self.rider.profile,
        )
        OrderItem.objects.create(
            order=self.order, product=self.product, quantity=2, price=Decimal('150.00'),
        )

    # ── Rider path ───────────────────────────────────────────────────────────

    def test_rider_delivery_charges_and_credits_cash(self):
        """Regression: this path never touched account_balance at all."""
        self.client.force_authenticate(self.rider)
        res = self.client.patch(
            f'/api/orders/delivery/orders/{self.order.id}/',
            {'delivery_status': 'Delivered', 'number_of_bottles': 2,
             'cash_received': True, 'cash_amount': 300},
            format='json',
        )
        self.assertEqual(res.status_code, 200)
        # Charged 300, collected 300 → settled.
        self.assertEqual(self.balance(self.customer), Decimal('0.00'))
        self.assertEqual(
            LedgerEntry.objects.filter(customer=self.customer).count(), 2,
        )
        self.assertLedgerConsistent(self.customer)

    def test_rider_partial_cash_leaves_a_balance(self):
        self.client.force_authenticate(self.rider)
        self.client.patch(
            f'/api/orders/delivery/orders/{self.order.id}/',
            {'delivery_status': 'Delivered', 'cash_received': True, 'cash_amount': 100},
            format='json',
        )
        self.assertEqual(self.balance(self.customer), Decimal('-200.00'))
        self.assertLedgerConsistent(self.customer)

    def test_rider_delivery_moves_bottle_stock(self):
        self.client.force_authenticate(self.rider)
        self.client.patch(
            f'/api/orders/delivery/orders/{self.order.id}/',
            {'delivery_status': 'Delivered', 'number_of_bottles': 2, 'cash_amount': 0},
            format='json',
        )
        self.assertEqual(self.stock(self.customer), 2)

    def test_rider_status_in_the_request_cannot_dodge_the_charge(self):
        """A rider submit always delivers, so it always posts the charge.

        The status in the request body is ignored — it used to be honoured, and
        'Not Responding' left the order open and the ledger untouched.
        """
        self.client.force_authenticate(self.rider)
        self.client.patch(
            f'/api/orders/delivery/orders/{self.order.id}/',
            {'delivery_status': 'Not Responding', 'cash_amount': 0},
            format='json',
        )
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'Delivered')
        self.assertEqual(self.balance(self.customer), Decimal('-300.00'))
        self.assertLedgerConsistent(self.customer)

    # ── Admin path ───────────────────────────────────────────────────────────

    def test_undelivered_order_posts_no_charge(self):
        """Charge lands on Delivered and not before — an order can sit open or
        be cancelled, and charging earlier puts phantom debt on the balance."""
        self.client.force_authenticate(self.admin)
        self.client.patch(
            f'/api/orders/admin/{self.order.id}/',
            {'status': 'Processing', 'cash_amount': 0},
            format='json',
        )
        self.assertEqual(self.balance(self.customer), Decimal('0.00'))
        self.assertEqual(LedgerEntry.objects.count(), 0)

    def test_admin_update_posts_to_ledger_without_double_counting(self):
        """The old inline balance mutation was removed; only the ledger writes now."""
        self.client.force_authenticate(self.admin)
        res = self.client.patch(
            f'/api/orders/admin/{self.order.id}/',
            {'status': 'Delivered', 'cash_amount': '300.00'},
            format='json',
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.balance(self.customer), Decimal('0.00'))
        self.assertLedgerConsistent(self.customer)

    def test_admin_repeated_updates_stay_idempotent(self):
        self.client.force_authenticate(self.admin)
        for _ in range(3):
            self.client.patch(
                f'/api/orders/admin/{self.order.id}/',
                {'status': 'Delivered', 'cash_amount': '300.00'},
                format='json',
            )
        self.assertEqual(self.balance(self.customer), Decimal('0.00'))
        self.assertLedgerConsistent(self.customer)

    def test_admin_raising_cash_posts_only_the_delta(self):
        self.client.force_authenticate(self.admin)
        url = f'/api/orders/admin/{self.order.id}/'
        self.client.patch(url, {'status': 'Delivered', 'cash_amount': '100.00'}, format='json')
        self.assertEqual(self.balance(self.customer), Decimal('-200.00'))
        self.client.patch(url, {'cash_amount': '300.00'}, format='json')
        self.assertEqual(self.balance(self.customer), Decimal('0.00'))
        self.assertLedgerConsistent(self.customer)

    def test_cancelling_a_delivered_order_reverses_the_charge(self):
        self.client.force_authenticate(self.admin)
        url = f'/api/orders/admin/{self.order.id}/'
        self.client.patch(url, {'status': 'Delivered'}, format='json')
        self.assertEqual(self.balance(self.customer), Decimal('-300.00'))
        self.client.patch(url, {'status': 'Cancelled'}, format='json')
        self.assertEqual(self.balance(self.customer), Decimal('0.00'))
        self.assertLedgerConsistent(self.customer)

    def test_guest_order_never_reaches_the_ledger(self):
        guest = Order.objects.create(
            user=None, guest_name='Walk-in', total_price=Decimal('500.00'),
            shipping_address='X', status='Processing',
        )
        self.client.force_authenticate(self.admin)
        res = self.client.patch(
            f'/api/orders/admin/{guest.id}/',
            {'status': 'Delivered', 'cash_amount': '500.00'},
            format='json',
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(LedgerEntry.objects.count(), 0)

    # ── Kill switch ──────────────────────────────────────────────────────────

    def test_auto_charge_switch_off_posts_nothing(self):
        settings_obj = LedgerSettings.load()
        settings_obj.auto_charge_enabled = False
        settings_obj.save()

        self.client.force_authenticate(self.admin)
        self.client.patch(
            f'/api/orders/admin/{self.order.id}/',
            {'status': 'Delivered', 'cash_amount': '300.00'},
            format='json',
        )
        self.assertEqual(LedgerEntry.objects.count(), 0)
        self.assertEqual(self.balance(self.customer), Decimal('0.00'))


class PlantLedgerWiringTests(LedgerTestMixin, TestCase):

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.admin.is_superuser = True
        self.admin.save()
        self.client.force_authenticate(self.admin)

        self.bottle_type = BottleType.objects.create(
            name='19L Refill', default_price=Decimal('150.00'),
        )
        self.customer_type = CustomerType.objects.create(
            name='Home', default_price=Decimal('150.00'),
        )

    def _payload(self, **extra):
        data = {
            'customer_id': self.customer.pk,
            'house': '355-F upper Jubilee',
            'bottle_type_id': self.bottle_type.pk,
            'customer_type_id': self.customer_type.pk,
            'bottles': 2,
            'unit_price': '150.00',
            'empties_collected': 2,
            'paid_amount': '0',
        }
        data.update(extra)
        return data

    def test_creating_a_record_charges_the_customer(self):
        res = self.client.post('/api/plant/records/', self._payload(), format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(self.balance(self.customer), Decimal('-300.00'))
        self.assertEqual(self.stock(self.customer), 0)  # 2 out, 2 empties back
        self.assertLedgerConsistent(self.customer)

    def test_recording_payment_on_a_record_credits_the_customer(self):
        res = self.client.post('/api/plant/records/', self._payload(), format='json')
        record_id = res.data['id']
        self.client.patch(
            f'/api/plant/records/{record_id}/', {'paid_amount': '300.00'}, format='json',
        )
        self.assertEqual(self.balance(self.customer), Decimal('0.00'))
        self.assertLedgerConsistent(self.customer)

    def test_unreturned_empties_raise_the_stock(self):
        self.client.post('/api/plant/records/', self._payload(empties_collected=0), format='json')
        self.assertEqual(self.stock(self.customer), 2)

    def test_deleting_a_record_unwinds_the_entries(self):
        res = self.client.post('/api/plant/records/', self._payload(), format='json')
        record_id = res.data['id']
        self.assertEqual(self.balance(self.customer), Decimal('-300.00'))

        self.client.delete(f'/api/plant/records/{record_id}/')
        self.assertEqual(self.balance(self.customer), Decimal('0.00'))
        self.assertFalse(DeliveryRecord.objects.filter(pk=record_id).exists())
        # The journal rows survive the record they came from.
        self.assertGreater(LedgerEntry.objects.filter(customer=self.customer).count(), 0)
        self.assertLedgerConsistent(self.customer)

    def test_reassigning_a_record_moves_the_money(self):
        res = self.client.post('/api/plant/records/', self._payload(), format='json')
        record_id = res.data['id']
        self.client.patch(
            f'/api/plant/records/{record_id}/', {'customer_id': self.other.pk}, format='json',
        )
        self.assertEqual(self.balance(self.customer), Decimal('0.00'))
        self.assertEqual(self.balance(self.other), Decimal('-300.00'))
        self.assertLedgerConsistent(self.customer)
        self.assertLedgerConsistent(self.other)

    def test_record_without_a_customer_posts_nothing(self):
        res = self.client.post(
            '/api/plant/records/', self._payload(customer_id=None), format='json',
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(LedgerEntry.objects.count(), 0)


class LedgerBackfillTests(LedgerTestMixin, TestCase):

    def setUp(self):
        super().setUp()
        UserProfile.objects.filter(user=self.customer).update(
            account_balance=Decimal('-4350.00')
        )

    def test_backfill_creates_one_opening_entry(self):
        call_command('ledger_backfill', verbosity=0)
        entries = LedgerEntry.objects.filter(customer=self.customer)
        self.assertEqual(entries.count(), 1)
        self.assertEqual(entries.first().entry_type, LedgerEntry.OPENING)
        self.assertEqual(entries.first().amount, Decimal('-4350.00'))

    def test_backfill_does_not_change_account_balance(self):
        """The field already holds this figure — writing it again would double it."""
        before = self.balance(self.customer)
        call_command('ledger_backfill', verbosity=0)
        self.assertEqual(self.balance(self.customer), before)
        self.assertLedgerConsistent(self.customer)

    def test_backfill_is_idempotent(self):
        call_command('ledger_backfill', verbosity=0)
        call_command('ledger_backfill', verbosity=0)
        call_command('ledger_backfill', verbosity=0)
        self.assertEqual(LedgerEntry.objects.filter(customer=self.customer).count(), 1)
        self.assertLedgerConsistent(self.customer)

    def test_backfill_sets_the_retro_charge_guard(self):
        call_command('ledger_backfill', verbosity=0)
        self.assertEqual(LedgerSettings.load().ledger_start_date, timezone.localdate())

    def test_backfill_leaves_auto_charge_off_by_default(self):
        LedgerSettings.objects.all().delete()
        call_command('ledger_backfill', verbosity=0)
        self.assertFalse(LedgerSettings.load().auto_charge_enabled)

    def test_enable_auto_charge_flag(self):
        call_command('ledger_backfill', '--enable-auto-charge', verbosity=0)
        self.assertTrue(LedgerSettings.load().auto_charge_enabled)

    def test_dry_run_writes_nothing(self):
        call_command('ledger_backfill', '--dry-run', verbosity=0)
        self.assertEqual(LedgerEntry.objects.count(), 0)

    def test_undo_removes_openings_and_leaves_balances(self):
        call_command('ledger_backfill', verbosity=0)
        before = self.balance(self.customer)
        call_command('ledger_backfill', '--undo', verbosity=0)
        self.assertEqual(LedgerEntry.objects.filter(entry_type=LedgerEntry.OPENING).count(), 0)
        self.assertEqual(self.balance(self.customer), before)

    def test_backfill_assigns_customer_codes(self):
        call_command('ledger_backfill', verbosity=0)
        self.customer.profile.refresh_from_db()
        self.assertIsNotNone(self.customer.profile.customer_code)
