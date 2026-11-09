from decimal import Decimal

from django.contrib.auth.models import Permission, User
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework import status as http
from rest_framework.test import APIClient

from accounts.models import DiscountCategory
from activities.models import ActivityLog
from products.models import Product
from .models import Order, OrderItem


class RiderDeliveryUpdateTests(TestCase):
    """The rider marking an order Delivered must also move the main order status."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()

        self.rider = User.objects.create_user(username='rider1', password='RiderPass1!')
        self.rider.profile.user_type = 'delivery_boy'
        self.rider.profile.is_rider = True
        self.rider.profile.save()

        self.customer = User.objects.create_user(username='cust1', password='CustPass1!')

        self.product = Product.objects.create(
            name='19L Bottle', price=Decimal('250.00'),
        )
        self.order = Order.objects.create(
            user=self.customer,
            total_price=Decimal('500.00'),
            shipping_address='H-12, Block 6',
            status='Processing',
            assigned_delivery_boy=self.rider.profile,
        )
        OrderItem.objects.create(
            order=self.order, product=self.product, quantity=2, price=Decimal('250.00'),
        )
        self.url = f'/api/orders/delivery/orders/{self.order.id}/'
        self.client.force_authenticate(self.rider)

    def _deliver(self, **extra):
        payload = {
            'status': self.order.status,      # what the mobile app sends today
            'delivery_status': 'Delivered',
            'number_of_bottles': 2,
            'delivery_notes': 'Handed to customer',
            'cash_received': True,
            'cash_amount': 500,
            'is_paid': False,
        }
        payload.update(extra)
        return self.client.patch(self.url, payload, format='json')

    def test_delivered_sets_main_order_status(self):
        response = self._deliver()
        self.assertEqual(response.status_code, http.HTTP_200_OK)
        self.order.refresh_from_db()
        self.assertEqual(self.order.delivery_status, 'Delivered')
        self.assertEqual(self.order.status, 'Delivered')

    def test_delivered_response_reports_new_status(self):
        """The app reads the response body, so it must show the new status too."""
        response = self._deliver()
        self.assertEqual(response.data['status'], 'Delivered')
        self.assertEqual(response.data['delivery_status'], 'Delivered')

    def test_delivered_stamps_completion_time_and_locks(self):
        self._deliver()
        self.order.refresh_from_db()
        self.assertIsNotNone(self.order.delivery_completed_at)
        self.assertIsNotNone(self.order.delivery_status_updated_at)

    def test_online_payment_waits_for_the_office(self):
        """The rider cannot see the bank, so Online no longer settles an order.
        The rest of this flow is covered in ledger/test_payment_claims.py."""
        self._deliver(cash_received=False, is_paid=True, cash_amount=500)
        self.order.refresh_from_db()
        self.assertFalse(self.order.is_paid)
        self.assertEqual(self.order.payment_claims.get().amount, Decimal('500.00'))

    def test_locked_after_delivery(self):
        self._deliver()
        second = self._deliver(delivery_notes='trying again')
        self.assertEqual(second.status_code, http.HTTP_400_BAD_REQUEST)

    def test_nothing_editable_once_delivered(self):
        """A completed delivery is the record of what happened at the door.

        Notes used to stay editable after delivery; they no longer are. The
        cash figure and the note are what the office reconciles against, so
        neither may move once the rider has closed the drop.
        """
        self._deliver()
        response = self.client.patch(
            self.url, {'delivery_notes': 'Left with guard'}, format='json',
        )
        self.assertEqual(response.status_code, http.HTTP_400_BAD_REQUEST)
        self.order.refresh_from_db()
        self.assertEqual(self.order.delivery_notes, 'Handed to customer')
        self.assertEqual(self.order.status, 'Delivered')

    def test_notes_not_editable_after_submitting(self):
        """A rider gets one submission per order and no second pass at the note.

        There used to be a window: submitting a non-Delivered status locked the
        status but left the note editable. Submitting now completes the delivery
        outright, so the window is gone.
        """
        self.client.patch(self.url, {'number_of_bottles': 2}, format='json')
        response = self.client.patch(
            self.url, {'delivery_notes': 'Gate locked, retrying at 5pm'}, format='json',
        )
        self.assertEqual(response.status_code, http.HTTP_400_BAD_REQUEST)

    def test_submitting_always_delivers(self):
        """Submitting *is* delivering — the rider app no longer sends a status,
        and one sent by any other client is ignored rather than honoured."""
        response = self.client.patch(
            self.url,
            {'status': 'Processing', 'delivery_status': 'Not Responding', 'number_of_bottles': 2},
            format='json',
        )
        self.assertEqual(response.status_code, http.HTTP_200_OK)
        self.order.refresh_from_db()
        self.assertEqual(self.order.delivery_status, 'Delivered')
        self.assertEqual(self.order.status, 'Delivered')

    def test_rider_cannot_force_arbitrary_status(self):
        """`status` is server-derived — a rider must not be able to cancel an
        order by asking for it."""
        self.client.patch(
            self.url,
            {'status': 'Cancelled', 'delivery_status': 'Not Responding'},
            format='json',
        )
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'Delivered')

    def test_submitting_without_a_status_still_delivers(self):
        """The old flow silently did nothing when the status was left 'Pending',
        leaving the order open with the rider believing it was closed."""
        response = self.client.patch(
            self.url,
            {'delivery_status': 'Pending', 'delivery_notes': 'Handed over'},
            format='json',
        )
        self.assertEqual(response.status_code, http.HTTP_200_OK)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'Delivered')
        self.assertIsNotNone(self.order.delivery_status_updated_at)

    def test_old_mid_flight_order_can_still_be_completed(self):
        """The old flow stamped delivery_status_updated_at for 'Not Responding'
        and 'Not Needed' — orders left MID-FLIGHT, to be re-attempted.

        Locking on that timestamp would strand every one of them as permanently
        un-deliverable, so the lock keys on the order being finished instead.
        """
        self.order.delivery_status = 'Not Responding'
        self.order.delivery_status_updated_at = timezone.now()
        self.order.save(update_fields=['delivery_status', 'delivery_status_updated_at'])
        response = self._deliver()
        self.assertEqual(response.status_code, http.HTTP_200_OK, response.data)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'Delivered')

    def test_rider_cannot_write_to_an_order_the_office_cancelled(self):
        """Cancelling writes `status` alone — it never touches delivery_status
        or its timestamp. A rider holding a screen opened before the cancel must
        not be able to resurrect the order and charge the customer for it.
        """
        self.order.status = 'Cancelled'
        self.order.save(update_fields=['status'])
        response = self._deliver()
        self.assertEqual(response.status_code, http.HTTP_400_BAD_REQUEST)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'Cancelled')
        self.assertEqual(self.order.delivery_status, 'Pending')

    def test_rider_cannot_rewrite_an_order_the_office_already_delivered(self):
        """Same shape: the office marked it Delivered from the admin panel, so
        the rider's cash and bottle figures must not overwrite the office's."""
        self.order.status = 'Delivered'
        self.order.cash_amount = Decimal('500.00')
        self.order.save(update_fields=['status', 'cash_amount'])
        response = self._deliver(cash_amount=9999)
        self.assertEqual(response.status_code, http.HTTP_400_BAD_REQUEST)
        self.order.refresh_from_db()
        self.assertEqual(self.order.cash_amount, Decimal('500.00'))

    def test_delivered_order_leaves_riders_active_list(self):
        self._deliver()
        listing = self.client.get('/api/orders/delivery/orders/')
        self.assertEqual(listing.status_code, http.HTTP_200_OK)
        ids = [o['id'] for o in listing.data]
        self.assertNotIn(self.order.id, ids)


class OrderDiscountTests(TestCase):
    """Auto-applied discount categories on shop orders — both billing paths."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='orderadmin', password='Pass1234!', is_staff=True,
        )
        self.customer = User.objects.create_user(username='wholesale1', password='Pass1234!')
        self.customer.profile.user_type = 'customer'
        self.customer.profile.save()
        self.plain = User.objects.create_user(username='plain1', password='Pass1234!')
        self.plain.profile.user_type = 'customer'
        self.plain.profile.save()

        self.wholesale = DiscountCategory.objects.create(
            name='Wholesale', discount_type='fixed', discount_value=Decimal('30'),
        )
        self.customer.profile.discount_category = self.wholesale
        self.customer.profile.save(update_fields=['discount_category'])

        self.bottle = Product.objects.create(name='19L Bottle', price=Decimal('180.00'))

    def _grant_override(self, user):
        user.user_permissions.add(
            Permission.objects.get(codename='can_override_discount')
        )
        return User.objects.get(pk=user.pk)  # drop the cached permission set

    def _admin_create(self, **extra):
        payload = {
            'user_id': self.customer.pk,
            'shipping_address': 'H-12, Block 6',
            'items': [{'product_id': self.bottle.pk, 'quantity': 2}],
        }
        payload.update(extra)
        return self.client.post('/api/orders/admin/', payload, format='json')

    # ── Auto application ─────────────────────────────────────────────────────

    def test_admin_order_applies_customers_category(self):
        self.client.force_authenticate(self.admin)
        res = self._admin_create()
        self.assertEqual(res.status_code, http.HTTP_201_CREATED)
        self.assertEqual(Decimal(res.data['gross_amount']), Decimal('360.00'))
        self.assertEqual(Decimal(res.data['discount_amount']), Decimal('60.00'))
        self.assertEqual(res.data['discount_category_name'], 'Wholesale')
        self.assertEqual(Decimal(res.data['total_price']), Decimal('300.00'))

    def test_admin_order_without_category_has_no_discount(self):
        self.client.force_authenticate(self.admin)
        res = self._admin_create(user_id=self.plain.pk)
        self.assertEqual(Decimal(res.data['discount_amount']), Decimal('0.00'))
        self.assertEqual(res.data['discount_category_name'], '')
        self.assertEqual(Decimal(res.data['total_price']), Decimal('360.00'))

    def test_customer_checkout_applies_category_and_ignores_client_figures(self):
        """The client NEVER supplies discount amounts — or the total."""
        self.client.force_authenticate(self.customer)
        res = self.client.post('/api/orders/', {
            'items': [{'product_id': self.bottle.pk, 'quantity': 2, 'price': '180.00'}],
            'shipping_address': 'H-12',
            'total_price': '1.00',          # ignored: server-computed
            'discount_amount': '9999.00',   # ignored: never client input
        }, format='json')
        self.assertEqual(res.status_code, http.HTTP_201_CREATED)
        order = Order.objects.get(pk=res.data['id'])
        self.assertEqual(order.gross_amount, Decimal('360.00'))
        self.assertEqual(order.discount_amount, Decimal('60.00'))
        self.assertEqual(order.total_price, Decimal('300.00'))
        self.assertEqual(order.discount_category_name, 'Wholesale')

    def test_checkout_without_category_bills_the_gross(self):
        self.client.force_authenticate(self.plain)
        res = self.client.post('/api/orders/', {
            'items': [{'product_id': self.bottle.pk, 'quantity': 2, 'price': '180.00'}],
            'shipping_address': 'H-12',
        }, format='json')
        self.assertEqual(res.status_code, http.HTTP_201_CREATED)
        order = Order.objects.get(pk=res.data['id'])
        self.assertEqual(order.total_price, Decimal('360.00'))
        self.assertEqual(order.discount_amount, Decimal('0.00'))

    # ── Percentage math ──────────────────────────────────────────────────────

    def test_percentage_rounds_half_up_per_line_then_sums(self):
        pct = DiscountCategory.objects.create(
            name='Five Percent', discount_type='percentage', discount_value=Decimal('5'),
        )
        self.customer.profile.discount_category = pct
        self.customer.profile.save(update_fields=['discount_category'])
        odd = Product.objects.create(name='Odd Priced', price=Decimal('130.50'))

        self.client.force_authenticate(self.admin)
        res = self._admin_create(items=[
            {'product_id': odd.pk, 'quantity': 1},
            {'product_id': odd.pk, 'quantity': 1},
        ])
        # 5% of 130.50 = 6.525 → 6.53 per line; summed = 13.06. Discounting the
        # whole order at once would give 13.05, which is wrong.
        self.assertEqual(Decimal(res.data['discount_amount']), Decimal('13.06'))
        self.assertEqual(Decimal(res.data['total_price']), Decimal('247.94'))

    def test_discount_never_pushes_a_line_below_zero(self):
        big = DiscountCategory.objects.create(
            name='Bigger Than The Bill', discount_type='fixed', discount_value=Decimal('500'),
        )
        self.customer.profile.discount_category = big
        self.customer.profile.save(update_fields=['discount_category'])
        self.client.force_authenticate(self.admin)
        res = self._admin_create(items=[{'product_id': self.bottle.pk, 'quantity': 1}])
        self.assertEqual(Decimal(res.data['discount_amount']), Decimal('180.00'))
        self.assertEqual(Decimal(res.data['total_price']), Decimal('0.00'))

    # ── Snapshot freezing ────────────────────────────────────────────────────

    def test_editing_the_category_never_changes_an_existing_order(self):
        self.client.force_authenticate(self.admin)
        order_id = self._admin_create().data['id']

        self.wholesale.discount_value = Decimal('99')
        self.wholesale.save()

        order = Order.objects.get(pk=order_id)
        self.assertEqual(order.discount_amount, Decimal('60.00'))
        self.assertEqual(order.discount_value, Decimal('30.00'))
        self.assertEqual(order.total_price, Decimal('300.00'))

        # Only FUTURE billing sees the new value.
        fresh = self._admin_create()
        self.assertEqual(Decimal(fresh.data['discount_amount']), Decimal('198.00'))

    # ── Override permission ──────────────────────────────────────────────────

    def test_staff_without_permission_cannot_override(self):
        """is_staff alone must not be enough, and nothing may be logged."""
        self.client.force_authenticate(self.admin)
        before = Order.objects.count()
        res = self._admin_create(discount_override='10.00')
        self.assertEqual(res.status_code, http.HTTP_403_FORBIDDEN)
        self.assertEqual(Order.objects.count(), before)
        self.assertFalse(
            ActivityLog.objects.filter(action='Discount Overridden').exists()
        )

    def test_override_with_permission_applies_and_is_audited(self):
        admin = self._grant_override(self.admin)
        self.client.force_authenticate(admin)
        res = self._admin_create(discount_override='50.00')
        self.assertEqual(res.status_code, http.HTTP_201_CREATED)
        self.assertEqual(Decimal(res.data['discount_amount']), Decimal('50.00'))
        self.assertEqual(Decimal(res.data['total_price']), Decimal('310.00'))
        self.assertTrue(res.data['discount_overridden'])

        row = ActivityLog.objects.get(action='Discount Overridden')
        self.assertEqual(row.actor_id, admin.pk)
        self.assertEqual(row.details['auto_discount'], '60.00')
        self.assertEqual(row.details['override_discount'], '50.00')

    def test_override_is_capped_at_the_gross(self):
        admin = self._grant_override(self.admin)
        self.client.force_authenticate(admin)
        res = self._admin_create(discount_override='9999.00')
        self.assertEqual(Decimal(res.data['discount_amount']), Decimal('360.00'))
        self.assertEqual(Decimal(res.data['total_price']), Decimal('0.00'))

    def test_superuser_can_override_without_explicit_grant(self):
        root = User.objects.create_superuser(
            username='rootoverride', email='root@example.com', password='RootPass1!',
        )
        self.client.force_authenticate(root)
        res = self._admin_create(discount_override='0.00')
        self.assertEqual(res.status_code, http.HTTP_201_CREATED)
        self.assertEqual(Decimal(res.data['discount_amount']), Decimal('0.00'))
        self.assertEqual(Decimal(res.data['total_price']), Decimal('360.00'))

    # ── Customer visibility ──────────────────────────────────────────────────

    def test_customer_sees_breakdown_but_never_the_assignment(self):
        """Their receipt shows gross/discount/net; the assignment key is absent."""
        self.client.force_authenticate(self.customer)
        self.client.post('/api/orders/', {
            'items': [{'product_id': self.bottle.pk, 'quantity': 2, 'price': '180.00'}],
            'shipping_address': 'H-12',
        }, format='json')
        listing = self.client.get('/api/orders/')
        self.assertEqual(listing.status_code, http.HTTP_200_OK)
        payload = listing.data[0]
        # The receipt breakdown IS theirs to see…
        self.assertEqual(Decimal(payload['gross_amount']), Decimal('360.00'))
        self.assertEqual(Decimal(payload['discount_amount']), Decimal('60.00'))
        self.assertEqual(payload['discount_category_name'], 'Wholesale')
        # …but the assignment and internal flags are not.
        self.assertNotIn('discount_category', payload.keys())
        self.assertNotIn('discount_overridden', payload.keys())
