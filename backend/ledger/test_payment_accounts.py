"""
The business banks with more than one institution, so the rider must be able to
show whichever account matches the customer's own bank.

The risk this file exists for: rider builds already installed read the OLD flat
payment_* keys and know nothing about `payment_accounts`. This project ships by
hand, so those builds stay in the field for a long time. Dropping the flat keys
would blank the Pay tab on every one of them.
"""

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from rest_framework import status as http
from rest_framework.test import APIClient

from .models import LedgerSettings, PaymentAccount


class PaymentAccountApiTests(TestCase):

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.admin = User.objects.create_user(username='boss', password='BossPass1!')
        self.admin.is_staff = True
        self.admin.is_superuser = True
        self.admin.save()
        # Riders and customers read the details signed IN — they are withheld
        # from anonymous callers on purpose, so bank details are not scrapeable.
        self.reader = User.objects.create_user(username='rider9', password='RiderPass1!')
        self.url = '/api/ledger/admin/payment-accounts/'
        # Migration 0008 seeds the real Meezan account, so a fresh database is
        # NOT empty. These tests are about CRUD, ordering and the legacy
        # fallback, so they start from a known-empty table; the seed itself is
        # covered by SeededMeezanAccountTests below.
        PaymentAccount.objects.all().delete()

    def _add(self, **extra):
        payload = {
            'bank_name': 'Meezan Bank',
            'account_title': 'Century Sip',
            'account_number': '0258 0108357297',
            'iban': 'PK13MEZN0002580108357297',
            'instructions': 'Please share screenshot.',
        }
        payload.update(extra)
        self.client.force_authenticate(self.admin)
        return self.client.post(self.url, payload, format='json')

    # ── Admin CRUD ───────────────────────────────────────────────────────────

    def test_admin_can_add_an_account(self):
        res = self._add()
        self.assertEqual(res.status_code, http.HTTP_201_CREATED, res.data)
        self.assertEqual(PaymentAccount.objects.count(), 1)
        self.assertEqual(res.data['iban'], 'PK13MEZN0002580108357297')

    def test_admin_can_add_several(self):
        self._add()
        self._add(bank_name='JazzCash', account_number='03001234567', iban='')
        self.assertEqual(PaymentAccount.objects.count(), 2)

    def test_account_with_nothing_to_pay_into_is_refused(self):
        """A card the customer cannot act on is worse than no card."""
        res = self._add(account_number='', iban='')
        self.assertEqual(res.status_code, http.HTTP_400_BAD_REQUEST)

    def test_admin_can_edit_and_delete(self):
        pk = self._add().data['id']
        patched = self.client.patch(f'{self.url}{pk}/', {'bank_name': 'HBL'}, format='json')
        self.assertEqual(patched.status_code, http.HTTP_200_OK)
        self.assertEqual(patched.data['bank_name'], 'HBL')
        removed = self.client.delete(f'{self.url}{pk}/')
        self.assertEqual(removed.status_code, http.HTTP_204_NO_CONTENT)
        self.assertEqual(PaymentAccount.objects.count(), 0)

    def test_non_staff_cannot_manage_accounts(self):
        customer = User.objects.create_user(username='cust', password='CustPass1!')
        self.client.force_authenticate(customer)
        res = self.client.get(self.url)
        self.assertIn(res.status_code, (http.HTTP_401_UNAUTHORIZED, http.HTTP_403_FORBIDDEN))

    # ── What the clients read ────────────────────────────────────────────────

    def test_business_endpoint_lists_active_accounts(self):
        self._add()
        self._add(bank_name='JazzCash', account_number='03001234567', iban='')
        self.client.force_authenticate(self.reader)
        res = self.client.get('/api/ledger/business/')
        banks = [a['bank_name'] for a in res.data['payment_accounts']]
        self.assertEqual(banks, ['Meezan Bank', 'JazzCash'])
        self.assertTrue(res.data['has_payment_details'])

    def test_inactive_accounts_are_hidden_from_clients(self):
        self._add()
        self._add(bank_name='Closed Bank', account_number='1', iban='', is_active=False)
        self.client.force_authenticate(self.reader)
        res = self.client.get('/api/ledger/business/')
        banks = [a['bank_name'] for a in res.data['payment_accounts']]
        self.assertEqual(banks, ['Meezan Bank'])

    def test_sort_order_decides_what_the_rider_sees_first(self):
        self._add(bank_name='Second', sort_order=2)
        self._add(bank_name='First', sort_order=1)
        self.client.force_authenticate(self.reader)
        res = self.client.get('/api/ledger/business/')
        self.assertEqual(
            [a['bank_name'] for a in res.data['payment_accounts']], ['First', 'Second'],
        )

    # ── Old builds must keep working ─────────────────────────────────────────

    def test_old_flat_keys_mirror_the_first_active_account(self):
        """A rider build already in the field reads these and nothing else."""
        self._add()
        self.client.force_authenticate(self.reader)
        res = self.client.get('/api/ledger/business/')
        self.assertEqual(res.data['payment_bank_name'], 'Meezan Bank')
        self.assertEqual(res.data['payment_account_title'], 'Century Sip')
        self.assertEqual(res.data['payment_account_number'], '0258 0108357297')
        self.assertEqual(res.data['payment_instructions'], 'Please share screenshot.')

    def test_flat_keys_fall_back_to_iban_when_there_is_no_account_number(self):
        self._add(account_number='')
        self.client.force_authenticate(self.reader)
        res = self.client.get('/api/ledger/business/')
        self.assertEqual(
            res.data['payment_account_number'], 'PK13MEZN0002580108357297',
        )

    def test_legacy_settings_still_serve_when_no_accounts_exist(self):
        """Before the office adds any account, the old singleton still works."""
        cfg = LedgerSettings.load()
        cfg.payment_bank_name = 'Old Bank'
        cfg.payment_account_title = 'Old Title'
        cfg.payment_account_number = '999'
        cfg.save()
        self.client.force_authenticate(self.reader)
        res = self.client.get('/api/ledger/business/')
        self.assertEqual(res.data['payment_bank_name'], 'Old Bank')
        self.assertTrue(res.data['has_payment_details'])
        self.assertEqual(res.data['payment_accounts'], [])

    def test_no_accounts_and_no_legacy_reports_not_configured(self):
        self.client.force_authenticate(self.reader)
        res = self.client.get('/api/ledger/business/')
        self.assertFalse(res.data['has_payment_details'])

    def test_bank_details_are_not_served_to_anonymous_callers(self):
        """Contact details are public; the account number is not."""
        self._add()
        self.client.force_authenticate(None)
        res = self.client.get('/api/ledger/business/')
        self.assertEqual(res.status_code, http.HTTP_200_OK)
        self.assertIn('name', res.data)                    # contact info still public
        self.assertNotIn('payment_accounts', res.data)
        self.assertNotIn('payment_account_number', res.data)


class SeededMeezanAccountTests(TestCase):
    """The Meezan account must exist on a fresh deployment without anyone
    retyping it — that step would eventually be forgotten, and a rider with no
    account to show is a customer who cannot pay by transfer."""

    def test_the_business_account_is_present_after_migrations(self):
        account = PaymentAccount.objects.filter(bank_name='Meezan Bank').first()
        self.assertIsNotNone(account, 'migration 0008 should have seeded it')
        self.assertEqual(account.account_title, 'Century Sip')
        self.assertEqual(account.account_number, '0258 0108357297')
        self.assertEqual(account.iban, 'PK13MEZN0002580108357297')
        self.assertTrue(account.is_active)

    def test_riders_see_it_without_any_setup(self):
        reader = User.objects.create_user(username='rider0', password='RiderPass1!')
        self.client = APIClient()
        self.client.force_authenticate(reader)
        res = self.client.get('/api/ledger/business/')
        self.assertTrue(res.data['has_payment_details'])
        banks = [a['bank_name'] for a in res.data['payment_accounts']]
        self.assertIn('Meezan Bank', banks)
