"""Statement arithmetic, PDF rendering and the HTTP API."""

import datetime
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from . import service
from .models import LedgerEntry
from .pdf import amount_in_words, render_receipt, render_statement
from .statement import build_statement
from .tests import LedgerTestMixin

D = datetime.date.fromisoformat


class LedgerStatementTests(LedgerTestMixin, TestCase):
    """Reproduces the real printed Detail Ledger, figure for figure."""

    def setUp(self):
        super().setUp()
        # Arrears carried in from before the window, plus 1 bottle already held.
        service.post_manual(
            customer=self.customer, entry_type=LedgerEntry.OPENING,
            amount=Decimal('-4350'), description='Opening balance',
            entry_date=D('2026-06-30'), bottles_out=1,
        )
        for date, amount, qty, doc in (
            ('2026-07-01', '-300', 2, '29816'),
            ('2026-07-04', '-750', 5, '29818'),
        ):
            service.post_entry(
                customer=self.customer, entry_type=LedgerEntry.PLANT_CHARGE,
                amount=Decimal(amount), entry_date=D(date),
                item_label='C.Sip 19L Refill', quantity=qty, unit_price=150,
                document_number=doc, bottles_out=qty, bottles_in=qty,
            )
        service.record_payment(
            customer=self.customer, amount=Decimal('5400'),
            payment_method='Cash', entry_date=D('2026-07-10'),
        )
        service.post_entry(
            customer=self.customer, entry_type=LedgerEntry.PLANT_CHARGE,
            amount=Decimal('-900'), entry_date=D('2026-07-12'),
            item_label='C.Sip 19L Refill', quantity=6, unit_price=150,
            document_number='29817', bottles_out=6, bottles_in=6,
        )
        self.data = build_statement(
            self.customer, start=D('2026-07-01'), end=D('2026-08-01'),
        )

    def test_opening_balance_and_stock(self):
        self.assertEqual(self.data['opening_balance'], Decimal('4350'))
        self.assertEqual(self.data['opening_stock'], 1)

    def test_running_balances_match_printed_ledger(self):
        self.assertEqual(
            [r.running_balance for r in self.data['rows']],
            [Decimal('4650'), Decimal('5400'), Decimal('0'), Decimal('900')],
        )

    def test_period_totals_match_printed_ledger(self):
        totals = self.data['totals']
        self.assertEqual(totals['debit'], Decimal('1950'))
        self.assertEqual(totals['credit'], Decimal('5400'))
        self.assertEqual(totals['quantity'], Decimal('13'))
        self.assertEqual(totals['bottles_in'], 13)

    def test_closing_balance_and_stock(self):
        self.assertEqual(self.data['closing_balance'], Decimal('900'))
        self.assertEqual(self.data['closing_stock'], 1)  # 1 + 13 out - 13 in

    def test_document_labels(self):
        labels = [r.document_label for r in self.data['rows']]
        self.assertEqual(labels[0], 'Sale - 29816')
        self.assertTrue(labels[2].startswith('Recovery - '))

    def test_wider_window_folds_nothing_into_arrears(self):
        wide = build_statement(self.customer, start=D('2026-01-01'))
        self.assertEqual(wide['opening_balance'], Decimal('0'))
        self.assertEqual(wide['count'], 5)

    def test_balance_is_owed_positive(self):
        """Storage is credit-positive; the statement shows what is owed."""
        self.assertEqual(self.balance(self.customer), Decimal('-900.00'))
        self.assertEqual(self.data['closing_balance'], Decimal('900'))

    def test_source_filter(self):
        manual_only = build_statement(self.customer, source='manual')
        self.assertTrue(all(r.source == 'manual' for r in manual_only['rows']))

    def test_filtered_statement_keeps_the_true_running_balance(self):
        """
        Regression: the running balance used to accumulate only the filtered
        rows, so a source-filtered statement printed a "balance" that was not
        what the customer owed — 1,950 instead of 900 on this fixture.
        """
        real = -self.balance(self.customer)          # owed-positive
        unfiltered = build_statement(self.customer)
        # These fixture rows carry no source FK, so they are all 'manual'.
        filtered = build_statement(self.customer, entry_type=LedgerEntry.PLANT_CHARGE)

        # Closing balance describes the account, so a filter must not change it.
        self.assertEqual(unfiltered['closing_balance'], real)
        self.assertEqual(filtered['closing_balance'], real)

        # The filter really did narrow the rows...
        self.assertEqual(len(filtered['rows']), 3)
        self.assertLess(len(filtered['rows']), len(unfiltered['rows']))

        # ...yet each visible row keeps the balance as at its own date, taken
        # from the full chronological sequence rather than the subset.
        by_date = {r.entry_date: r.running_balance for r in unfiltered['rows']}
        for row in filtered['rows']:
            self.assertEqual(row.running_balance, by_date[row.entry_date])
        # Subset-accumulation would have produced 300/1050/1950 here.
        self.assertEqual(
            [r.running_balance for r in filtered['rows']],
            [Decimal('4650'), Decimal('5400'), Decimal('900')],
        )

    def test_filter_narrows_totals_but_not_the_balance(self):
        """Totals describe the rows on screen; the balance describes the account."""
        charges = build_statement(self.customer, entry_type=LedgerEntry.PLANT_CHARGE)
        self.assertEqual(charges['totals']['debit'], Decimal('1950'))   # 3 deliveries
        self.assertEqual(charges['totals']['credit'], Decimal('0'))     # payment excluded
        self.assertEqual(charges['closing_balance'], Decimal('900'))    # still the truth

    def test_source_filter_excludes_rows_without_that_fk(self):
        """`source` is decided by the FK, not the entry_type label."""
        plant = build_statement(self.customer, source='plant')
        self.assertEqual(len(plant['rows']), 0)          # fixture rows have no FK
        self.assertEqual(plant['closing_balance'], Decimal('900'))


class LedgerDiscountColumnTests(LedgerTestMixin, TestCase):
    """The Gross / Discount / Net display columns on statements."""

    def setUp(self):
        super().setUp()
        from accounts.models import DiscountCategory
        from plant.models import DeliveryRecord

        wholesale = DiscountCategory.objects.create(
            name='Wholesale', discount_type='fixed', discount_value=Decimal('30'),
        )
        self.customer.profile.discount_category = wholesale
        self.customer.profile.save(update_fields=['discount_category'])

        # A discounted bottle round: gross 360, discount 60, net 300.
        self.record = DeliveryRecord.objects.create(
            customer=self.customer, house='355-F', bottles=2,
            unit_price=Decimal('180.00'),
        )
        service.sync_delivery_record(self.record)
        service.record_payment(customer=self.customer, amount=Decimal('300'))

    def test_charge_row_carries_gross_and_discount(self):
        data = build_statement(self.customer)
        charge = next(r for r in data['rows'] if r.entry_type == LedgerEntry.PLANT_CHARGE)
        self.assertEqual(charge.amount, Decimal('-300.00'))   # NET, invariant intact
        self.assertEqual(charge.gross_amount, Decimal('360.00'))
        self.assertEqual(charge.discount_amount, Decimal('60.00'))
        self.assertEqual(charge.discount_category_name, 'Wholesale')

    def test_undiscounted_rows_leave_the_columns_blank(self):
        """Blank means NULL — the statement must not print 0.00 there."""
        data = build_statement(self.customer)
        payment = next(r for r in data['rows'] if r.entry_type == LedgerEntry.PAYMENT)
        self.assertIsNone(payment.gross_amount)
        self.assertIsNone(payment.discount_amount)
        self.assertEqual(payment.discount_category_name, '')

    def test_totals_include_gross_and_discount(self):
        totals = build_statement(self.customer)['totals']
        self.assertEqual(totals['gross'], Decimal('360.00'))
        self.assertEqual(totals['discount'], Decimal('60.00'))
        self.assertEqual(totals['debit'], Decimal('300.00'))  # net stays the debit

    def test_statement_api_exposes_the_columns(self):
        client = APIClient()
        client.force_authenticate(self.admin)
        res = client.get(f'/api/ledger/customers/{self.customer.pk}/statement/')
        self.assertEqual(res.status_code, 200)
        by_type = {r['entry_type']: r for r in res.data['results']}
        charge = by_type['plant_charge']
        self.assertEqual(Decimal(charge['gross_amount']), Decimal('360.00'))
        self.assertEqual(Decimal(charge['discount_amount']), Decimal('60.00'))
        self.assertEqual(charge['discount_category_name'], 'Wholesale')
        payment = by_type['payment']
        self.assertIsNone(payment['gross_amount'])
        self.assertIsNone(payment['discount_amount'])

    def test_statement_pdf_renders_with_discount_columns(self):
        pdf = render_statement(build_statement(self.customer))
        self.assertTrue(pdf.startswith(b'%PDF'))
        self.assertGreater(len(pdf), 1000)

    def test_invariant_holds_after_discounted_charge_and_payment(self):
        self.assertEqual(self.balance(self.customer), Decimal('0.00'))
        self.assertLedgerConsistent(self.customer)

    def test_category_edit_after_billing_changes_no_ledger_row(self):
        """Re-syncing after a category edit must post nothing new."""
        from accounts.models import DiscountCategory
        before = list(LedgerEntry.objects.values_list('pk', 'amount'))

        DiscountCategory.objects.filter(name='Wholesale').update(discount_value=99)
        service.sync_delivery_record(self.record)  # idempotent: net unchanged

        self.assertEqual(list(LedgerEntry.objects.values_list('pk', 'amount')), before)
        self.assertLedgerConsistent(self.customer)


class LedgerPdfTests(LedgerTestMixin, TestCase):

    def test_statement_renders_a_pdf(self):
        service.record_payment(customer=self.customer, amount=500)
        pdf = render_statement(build_statement(self.customer))
        self.assertTrue(pdf.startswith(b'%PDF'))
        self.assertGreater(len(pdf), 1000)

    def test_statement_renders_with_no_entries(self):
        pdf = render_statement(build_statement(self.customer))
        self.assertTrue(pdf.startswith(b'%PDF'))

    def test_receipt_renders_a_pdf(self):
        entry = service.record_payment(customer=self.customer, amount=5400)
        self.assertTrue(render_receipt(entry).startswith(b'%PDF'))

    def test_receipt_survives_non_ascii_customer_name(self):
        """Guards ReportLab's Latin-1 built-in font limitation."""
        self.customer.first_name = 'عبد'
        self.customer.last_name = 'الصمد'
        self.customer.save()
        entry = service.record_payment(customer=self.customer, amount=100)
        self.assertTrue(render_receipt(entry).startswith(b'%PDF'))

    def test_voided_receipt_still_renders(self):
        entry = service.record_payment(customer=self.customer, amount=100)
        service.void_entry(entry, reason='bounced')
        entry.refresh_from_db()
        self.assertTrue(entry.is_reversed)
        self.assertTrue(render_receipt(entry).startswith(b'%PDF'))

    def test_amount_in_words(self):
        self.assertEqual(amount_in_words(5400), 'Rupees Five Thousand Four Hundred Only')
        self.assertEqual(amount_in_words(100000), 'Rupees One Lakh Only')
        self.assertEqual(amount_in_words(4500000), 'Rupees Forty Five Lakh Only')
        self.assertEqual(
            amount_in_words(Decimal('1950.50')),
            'Rupees One Thousand Nine Hundred Fifty and Fifty Paisa Only',
        )


class LedgerAPITests(LedgerTestMixin, TestCase):

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        for user in (self.customer, self.other):
            user.profile.user_type = 'customer'
            user.profile.save()
        self.client.force_authenticate(self.admin)

    def test_record_payment_endpoint(self):
        res = self.client.post('/api/ledger/payments/', {
            'customer_id': self.customer.pk, 'amount': '1500.00',
            'payment_method': 'Cash', 'reference': 'CHQ-1',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.data['receipt_number'].startswith('RCP-'))
        self.assertEqual(self.balance(self.customer), Decimal('1500.00'))
        self.assertLedgerConsistent(self.customer)

    def test_payment_response_carries_balance_after(self):
        """The mobile app builds its WhatsApp message from this field."""
        service.post_entry(
            customer=self.customer, entry_type=LedgerEntry.ORDER_CHARGE, amount=-1000,
        )
        res = self.client.post('/api/ledger/payments/', {
            'customer_id': self.customer.pk, 'amount': '400',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        # Stored credit-positive: -1000 + 400 = -600, i.e. 600 still owed.
        self.assertEqual(Decimal(res.data['balance_after']), Decimal('-600.00'))

    def test_business_info_is_public(self):
        """Powers the customer app's contact button, so it must not need auth."""
        self.client.force_authenticate(None)
        res = self.client.get('/api/ledger/business/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('name', res.data)
        self.assertIn('phone', res.data)

    def test_admin_can_rename_the_business(self):
        res = self.client.patch(
            '/api/ledger/business/', {'business_name': '  Aqua Fresh  '}, format='json',
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['name'], 'Aqua Fresh')

    def test_business_name_cannot_be_blank(self):
        res = self.client.patch(
            '/api/ledger/business/', {'business_name': '   '}, format='json',
        )
        self.assertEqual(res.status_code, 400)

    def test_customer_cannot_rename_the_business(self):
        self.client.force_authenticate(self.customer)
        res = self.client.patch(
            '/api/ledger/business/', {'business_name': 'Hijacked'}, format='json',
        )
        self.assertEqual(res.status_code, 403)

    def test_record_payment_assigns_customer_code(self):
        self.client.post('/api/ledger/payments/', {
            'customer_id': self.customer.pk, 'amount': '10',
        }, format='json')
        self.customer.profile.refresh_from_db()
        self.assertIsNotNone(self.customer.profile.customer_code)

    def test_record_payment_rejects_zero(self):
        res = self.client.post('/api/ledger/payments/', {
            'customer_id': self.customer.pk, 'amount': '0',
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_manual_entry_endpoint_sets_opening_stock(self):
        res = self.client.post('/api/ledger/entries/', {
            'customer_id': self.customer.pk, 'entry_type': 'opening',
            'amount': '-4350.00', 'description': 'Opening balance',
            'bottles_out': 1,
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(self.stock(self.customer), 1)

    def test_manual_entry_rejects_derived_type(self):
        res = self.client.post('/api/ledger/entries/', {
            'customer_id': self.customer.pk, 'entry_type': 'order_charge',
            'amount': '-10', 'description': 'nope',
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_void_endpoint(self):
        entry = service.record_payment(customer=self.customer, amount=200)
        res = self.client.post(f'/api/ledger/entries/{entry.pk}/void/',
                               {'reason': 'Bounced cheque'}, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(self.balance(self.customer), Decimal('0.00'))
        self.assertLedgerConsistent(self.customer)

    def test_void_rejects_derived_entry(self):
        entry = service.post_entry(
            customer=self.customer, entry_type=LedgerEntry.ORDER_CHARGE, amount=-50,
            source_ref='order:9:charge', source_key='order:9:charge#1',
        )
        res = self.client.post(f'/api/ledger/entries/{entry.pk}/void/',
                               {'reason': 'x'}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_statement_endpoint(self):
        service.record_payment(customer=self.customer, amount=300)
        res = self.client.get(f'/api/ledger/customers/{self.customer.pk}/statement/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['count'], 1)
        self.assertEqual(res.data['closing_balance'], Decimal('-300'))
        self.assertIn('opening_stock', res.data)

    def test_summary_endpoint(self):
        service.record_payment(customer=self.customer, amount=300)
        res = self.client.get(f'/api/ledger/customers/{self.customer.pk}/summary/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['total_paid'], Decimal('300'))

    def test_receivables_sorted_by_debt(self):
        """Ordering must be numeric — a lexicographic sort breaks at 1000 vs 900."""
        service.post_entry(customer=self.customer, entry_type=LedgerEntry.ORDER_CHARGE, amount=-1000)
        service.post_entry(customer=self.other, entry_type=LedgerEntry.ORDER_CHARGE, amount=-900)
        res = self.client.get('/api/ledger/customers/?only_owing=true')
        self.assertEqual(res.status_code, 200)
        balances = [Decimal(r['balance']) for r in res.data['results']]
        self.assertEqual(balances, [Decimal('1000'), Decimal('900')])

    def test_receivables_only_owing_excludes_credit(self):
        service.record_payment(customer=self.customer, amount=500)  # in credit
        res = self.client.get('/api/ledger/customers/?only_owing=true')
        ids = [r['id'] for r in res.data['results']]
        self.assertNotIn(self.customer.pk, ids)

    def test_receipt_pdf_endpoint(self):
        entry = service.record_payment(customer=self.customer, amount=750)
        res = self.client.get(f'/api/ledger/entries/{entry.pk}/receipt/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/pdf')
        self.assertIn(entry.receipt_number, res['Content-Disposition'])
        # The web client cannot read the filename cross-origin without this.
        self.assertIn('Content-Disposition', res['Access-Control-Expose-Headers'])
        self.assertTrue(res.content.startswith(b'%PDF'))

    def test_receipt_pdf_404_for_non_payment(self):
        entry = service.post_entry(
            customer=self.customer, entry_type=LedgerEntry.ORDER_CHARGE, amount=-50,
        )
        res = self.client.get(f'/api/ledger/entries/{entry.pk}/receipt/')
        self.assertEqual(res.status_code, 404)

    def test_statement_pdf_endpoint(self):
        service.record_payment(customer=self.customer, amount=100)
        res = self.client.get(f'/api/ledger/customers/{self.customer.pk}/statement.pdf')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.content.startswith(b'%PDF'))
        self.assertIn('Content-Disposition', res['Access-Control-Expose-Headers'])

    def test_customer_cannot_read_own_ledger(self):
        """The ledger is an admin tool - explicitly not customer-facing."""
        self.client.force_authenticate(self.customer)
        for url in (
            '/api/ledger/customers/',
            f'/api/ledger/customers/{self.customer.pk}/statement/',
            f'/api/ledger/customers/{self.customer.pk}/summary/',
        ):
            self.assertEqual(self.client.get(url).status_code, 403, url)

    def test_customer_cannot_record_a_payment(self):
        self.client.force_authenticate(self.customer)
        res = self.client.post('/api/ledger/payments/', {
            'customer_id': self.customer.pk, 'amount': '999',
        }, format='json')
        self.assertEqual(res.status_code, 403)

    def test_anonymous_is_rejected(self):
        self.client.force_authenticate(None)
        res = self.client.get('/api/ledger/customers/')
        self.assertIn(res.status_code, (401, 403))
