"""
Online payments: a rider's tap is only a claim, and nothing reaches a balance
until the office has seen the money.

The rider payloads here are the exact ones installed builds send, because those
phones keep working without an update.
"""

from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from orders.models import Order

from . import service
from .models import LedgerEntry, PaymentClaim
from .tests import LedgerTestMixin


class ClaimTestBase(LedgerTestMixin, TestCase):

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.rider = self.other
        self.rider.profile.user_type = 'delivery_boy'
        self.rider.profile.save()
        self.order = self.new_order()

    def new_order(self, **overrides):
        fields = {
            'user': self.customer,
            'total_price': Decimal('300.00'),
            'shipping_address': 'H-12',
            'status': 'Processing',
            'assigned_delivery_boy': self.rider.profile,
        }
        fields.update(overrides)
        return Order.objects.create(**fields)

    def deliver(self, order=None, **payload):
        order = order or self.order
        self.client.force_authenticate(self.rider)
        return self.client.patch(
            f'/api/orders/delivery/orders/{order.id}/', payload, format='json',
        )

    def deliver_online(self, order=None, amount=300):
        return self.deliver(
            order, number_of_bottles=2, delivery_notes='',
            cash_received=False, cash_amount=amount, is_paid=True,
        )

    def claim_for(self, order=None):
        return PaymentClaim.objects.get(order=order or self.order)

    def confirm(self, claim, **payload):
        self.client.force_authenticate(self.admin)
        return self.client.post(
            f'/api/ledger/claims/{claim.id}/confirm/', payload, format='json',
        )

    def not_found(self, claim, **payload):
        self.client.force_authenticate(self.admin)
        return self.client.post(
            f'/api/ledger/claims/{claim.id}/not-found/', payload, format='json',
        )

    def rider_card(self, order):
        self.client.force_authenticate(self.rider)
        return self.client.get(f'/api/orders/delivery/orders/{order.id}/').data['customer']


class RiderTapTests(ClaimTestBase):

    def test_online_tap_is_a_claim_and_moves_no_money(self):
        """Regression: this tap used to credit the customer on the rider's word."""
        response = self.deliver_online()
        self.assertEqual(response.status_code, 200)

        claim = self.claim_for()
        self.assertEqual(claim.status, PaymentClaim.WAITING)
        self.assertEqual(claim.amount, Decimal('300.00'))
        self.assertEqual(claim.customer, self.customer)
        self.assertEqual(claim.claimed_by, self.rider)

        # The delivery still happens and is still charged; only payment waits.
        self.assertEqual(self.balance(self.customer), Decimal('-300.00'))
        self.assertFalse(
            LedgerEntry.objects.filter(entry_type=LedgerEntry.ORDER_PAYMENT).exists()
        )
        self.assertLedgerConsistent(self.customer)

    def test_online_tap_leaves_the_order_unpaid(self):
        self.deliver_online()
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'Delivered')
        self.assertFalse(self.order.is_paid)
        self.assertFalse(self.order.cash_received)
        self.assertEqual(self.order.cash_amount, Decimal('0.00'))

    def test_response_tells_the_rider_it_is_waiting(self):
        response = self.deliver_online()
        self.assertEqual(
            response.data['online_claim'],
            {'amount': '300.00', 'status': PaymentClaim.WAITING},
        )

    def test_a_retried_online_submission_cannot_queue_twice(self):
        order = self.new_order()
        service.claim_online_payment(order=order, amount=300, actor=self.rider)
        service.claim_online_payment(order=order, amount=300, actor=self.rider)
        self.assertEqual(PaymentClaim.objects.filter(order=order).count(), 1)

    def test_cash_is_unchanged_and_now_labelled_cash(self):
        self.deliver(cash_received=True, cash_amount=300, is_paid=False)
        self.assertFalse(PaymentClaim.objects.exists())
        self.assertEqual(self.balance(self.customer), Decimal('0.00'))
        entry = LedgerEntry.objects.get(entry_type=LedgerEntry.ORDER_PAYMENT)
        self.assertEqual(entry.payment_method, LedgerEntry.CASH)

    def test_no_payment_stays_owed_with_no_claim(self):
        self.deliver(cash_received=False, cash_amount=0, is_paid=False)
        self.assertFalse(PaymentClaim.objects.exists())
        self.assertEqual(self.balance(self.customer), Decimal('-300.00'))

    def test_online_with_no_amount_cannot_mark_an_order_paid(self):
        """An empty amount box used to mark the order paid with nothing behind it."""
        self.deliver(cash_received=False, cash_amount=0, is_paid=True)
        self.order.refresh_from_db()
        self.assertFalse(self.order.is_paid)
        self.assertFalse(PaymentClaim.objects.exists())

    def test_rider_submission_keeps_an_office_paid_flag(self):
        """Cash submissions send is_paid=False, which used to wipe the office's."""
        self.order.is_paid = True
        self.order.save(update_fields=['is_paid'])
        self.deliver(cash_received=True, cash_amount=100, is_paid=False)
        self.order.refresh_from_db()
        self.assertTrue(self.order.is_paid)

    def test_next_rider_does_not_ask_for_a_waiting_payment_again(self):
        self.deliver_online()
        tomorrow = self.new_order()

        card = self.rider_card(tomorrow)

        self.assertEqual(card['online_waiting'], '300.00')
        self.assertEqual(card['account_balance'], '0.00')
        # The real balance is not touched by that courtesy.
        self.assertEqual(self.balance(self.customer), Decimal('-300.00'))


class ConfirmTests(ClaimTestBase):

    def test_confirming_posts_a_real_online_payment(self):
        self.deliver_online()
        response = self.confirm(self.claim_for(), reference='TX-1001')
        self.assertEqual(response.status_code, 200)

        claim = self.claim_for()
        self.assertEqual(claim.status, PaymentClaim.CONFIRMED)
        self.assertEqual(claim.resolved_by, self.admin)
        self.assertEqual(response.data['receipt_number'], claim.entry.receipt_number)

        entry = claim.entry
        self.assertEqual(entry.payment_method, LedgerEntry.ONLINE)
        self.assertEqual(entry.reference, 'TX-1001')
        self.assertEqual(entry.order, self.order)
        self.assertTrue(entry.receipt_number.startswith('RCP-'))

        self.assertEqual(self.balance(self.customer), Decimal('0.00'))
        self.order.refresh_from_db()
        self.assertTrue(self.order.is_paid)
        self.assertLedgerConsistent(self.customer)

    def test_the_transaction_id_is_optional(self):
        self.deliver_online()
        self.assertEqual(self.confirm(self.claim_for()).status_code, 200)

    def test_confirming_twice_pays_once(self):
        self.deliver_online()
        claim = self.claim_for()
        self.confirm(claim)
        second = self.confirm(claim)
        self.assertEqual(second.status_code, 400)
        self.assertEqual(self.balance(self.customer), Decimal('0.00'))
        self.assertLedgerConsistent(self.customer)

    def test_a_part_payment_leaves_the_order_unpaid(self):
        self.deliver_online(amount=100)
        self.confirm(self.claim_for())
        self.order.refresh_from_db()
        self.assertFalse(self.order.is_paid)
        self.assertEqual(self.balance(self.customer), Decimal('-200.00'))

    def test_a_claim_can_cover_old_dues_too(self):
        """The rider's pre-filled figure is old balance plus today's order."""
        service.post_manual(
            customer=self.customer, entry_type=LedgerEntry.OPENING,
            amount=-200, description='Opening balance',
        )
        self.deliver_online(amount=500)
        self.confirm(self.claim_for())
        self.assertEqual(self.balance(self.customer), Decimal('0.00'))
        self.assertLedgerConsistent(self.customer)

    def test_one_bank_transaction_cannot_pay_twice(self):
        """A real screenshot sent for two orders still has one transaction id."""
        self.deliver_online()
        second_order = self.new_order()
        self.deliver_online(second_order)
        self.confirm(self.claim_for(), reference='TX-1001')

        response = self.confirm(self.claim_for(second_order), reference='tx-1001 ')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.claim_for(second_order).status, PaymentClaim.WAITING)
        self.assertEqual(self.balance(self.customer), Decimal('-300.00'))

    def test_a_manual_online_payment_cannot_reuse_a_transaction_either(self):
        self.deliver_online()
        self.confirm(self.claim_for(), reference='TX-1001')
        with self.assertRaises(ValueError):
            service.record_payment(
                customer=self.customer, amount=300,
                payment_method=LedgerEntry.ONLINE, reference='TX-1001',
            )

    def test_voiding_a_confirmation_puts_the_claim_back(self):
        """The bank reversed it, or the office confirmed the wrong one."""
        self.deliver_online()
        self.confirm(self.claim_for(), reference='TX-1001')
        entry = self.claim_for().entry

        response = self.client.post(
            f'/api/ledger/entries/{entry.id}/void/',
            {'reason': 'Bank reversed the transfer'}, format='json',
        )

        self.assertEqual(response.status_code, 201)
        claim = self.claim_for()
        self.assertEqual(claim.status, PaymentClaim.NOT_FOUND)
        self.assertIsNone(claim.entry)
        self.assertEqual(claim.note, 'Bank reversed the transfer')
        self.order.refresh_from_db()
        self.assertFalse(self.order.is_paid)
        self.assertEqual(self.balance(self.customer), Decimal('-300.00'))
        self.assertLedgerConsistent(self.customer)

    def test_a_voided_transaction_id_can_be_used_again(self):
        self.deliver_online()
        self.confirm(self.claim_for(), reference='TX-1001')
        self.client.post(
            f'/api/ledger/entries/{self.claim_for().entry.id}/void/',
            {'reason': 'Wrong customer'}, format='json',
        )
        second_order = self.new_order()
        self.deliver_online(second_order)
        response = self.confirm(self.claim_for(second_order), reference='TX-1001')
        self.assertEqual(response.status_code, 200)

    def test_a_guest_order_is_marked_paid_with_no_ledger(self):
        guest = self.new_order(user=None, guest_name='Ali', guest_phone='03001234567')
        self.deliver_online(guest)

        claim = self.claim_for(guest)
        self.assertIsNone(claim.customer)
        response = self.confirm(claim)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['customer_name'], 'Ali')
        self.assertIsNone(response.data['receipt_number'])
        guest.refresh_from_db()
        self.assertTrue(guest.is_paid)
        self.assertFalse(LedgerEntry.objects.exists())


class NotFoundTests(ClaimTestBase):

    def test_not_found_leaves_the_money_owed(self):
        self.deliver_online()
        response = self.not_found(self.claim_for(), note='Nothing on the statement')
        self.assertEqual(response.status_code, 200)

        claim = self.claim_for()
        self.assertEqual(claim.status, PaymentClaim.NOT_FOUND)
        self.assertEqual(claim.note, 'Nothing on the statement')
        self.assertEqual(self.balance(self.customer), Decimal('-300.00'))
        self.assertFalse(
            LedgerEntry.objects.filter(entry_type=LedgerEntry.ORDER_PAYMENT).exists()
        )

    def test_the_rider_collects_it_again_after_not_found(self):
        self.deliver_online()
        self.not_found(self.claim_for())
        card = self.rider_card(self.new_order())
        self.assertEqual(card['online_waiting'], '0.00')
        self.assertEqual(card['account_balance'], '300.00')

    def test_a_late_transfer_can_still_be_confirmed(self):
        self.deliver_online()
        claim = self.claim_for()
        self.not_found(claim)
        self.assertEqual(self.confirm(claim, reference='TX-LATE').status_code, 200)
        self.assertEqual(self.balance(self.customer), Decimal('0.00'))
        self.assertEqual(self.claim_for().note, '')

    def test_a_confirmed_payment_cannot_be_marked_not_found(self):
        self.deliver_online()
        claim = self.claim_for()
        self.confirm(claim)
        self.assertEqual(self.not_found(claim).status_code, 400)
        self.assertEqual(self.claim_for().status, PaymentClaim.CONFIRMED)


class ClaimListTests(ClaimTestBase):

    def setUp(self):
        super().setUp()
        self.deliver_online()
        self.claim = self.claim_for()
        self.client.force_authenticate(self.admin)

    def test_lists_what_still_needs_checking_by_default(self):
        response = self.client.get('/api/ledger/claims/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(Decimal(str(response.data['total_amount'])), Decimal('300.00'))
        row = response.data['results'][0]
        self.assertEqual(row['order'], self.order.id)
        self.assertEqual(row['claimed_by_name'], self.rider.username)

    def test_filters_by_status(self):
        self.not_found(self.claim)
        self.assertEqual(self.client.get('/api/ledger/claims/').data['count'], 0)
        closed = self.client.get('/api/ledger/claims/?status=not_found')
        self.assertEqual(closed.data['count'], 1)

    def test_searches_by_customer(self):
        self.assertEqual(self.client.get('/api/ledger/claims/?search=cust1').data['count'], 1)
        self.assertEqual(self.client.get('/api/ledger/claims/?search=nobody').data['count'], 0)

    def test_riders_and_customers_cannot_see_or_settle_claims(self):
        for user in (self.rider, self.customer):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get('/api/ledger/claims/').status_code, 403)
            self.assertEqual(
                self.client.post(
                    f'/api/ledger/claims/{self.claim.id}/confirm/', {}, format='json',
                ).status_code,
                403,
            )
        self.assertEqual(self.claim_for().status, PaymentClaim.WAITING)


class UnverifiedOnlineCommandTests(ClaimTestBase):

    def run_command(self, *args):
        out = StringIO()
        call_command('ledger_unverified_online', *args, stdout=out)
        return out.getvalue()

    def old_online_order(self, **overrides):
        """What an Online tap left behind before claims existed."""
        fields = {
            'status': 'Delivered', 'is_paid': True, 'cash_received': False,
            'cash_amount': Decimal('300.00'), 'delivery_completed_at': timezone.now(),
        }
        fields.update(overrides)
        return self.new_order(**fields)

    def test_lists_old_online_taps(self):
        order = self.old_online_order()
        output = self.run_command()
        self.assertIn(f'#{order.id}', output)
        self.assertIn('1 unverified online payment(s), PKR 300.00 in total.', output)

    def test_skips_cash_and_new_claims(self):
        self.old_online_order(cash_received=True)
        self.deliver_online()
        self.assertIn('0 unverified online payment(s)', self.run_command())

    def test_since_limits_the_list(self):
        self.old_online_order()
        self.assertIn('0 unverified', self.run_command('--since', '2999-01-01'))
