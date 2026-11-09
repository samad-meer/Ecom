"""
List rider deliveries marked Online before payment claims existed.

    manage.py ledger_unverified_online
    manage.py ledger_unverified_online --since 2026-08-01

Those taps went straight to the ledger with nobody checking the bank, so each
row is money the books say arrived that may never have. Read-only: check them
against the statement once, and correct any that are missing through the order.
"""

from datetime import datetime

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Sum

from core.timeframes import scope_to_days
from orders.models import Order


class Command(BaseCommand):
    help = 'List old rider Online payments that nobody verified against the bank.'

    def add_arguments(self, parser):
        parser.add_argument('--since', help='Only deliveries on or after YYYY-MM-DD.')

    def handle(self, *args, **options):
        since = None
        if options['since']:
            try:
                since = datetime.strptime(options['since'], '%Y-%m-%d').date()
            except ValueError:
                raise CommandError('--since must look like 2026-08-01.')

        # The shape the rider app wrote for an Online tap. New ones never match:
        # they keep cash_amount at zero and become a PaymentClaim instead.
        orders = scope_to_days(
            Order.objects.filter(
                status='Delivered', is_paid=True, cash_received=False, cash_amount__gt=0,
            ),
            'delivery_completed_at', date_from=since,
        ).select_related(
            'user', 'assigned_delivery_boy', 'assigned_delivery_boy__user',
        ).order_by('delivery_completed_at', 'id')

        for order in orders:
            rider = order.assigned_delivery_boy
            self.stdout.write(
                f'  #{order.id:<7} {order.delivery_completed_at:%Y-%m-%d} '
                f'{(order.user.username if order.user else order.guest_name or "Guest"):<24} '
                f'{(rider.user.username if rider else "-"):<16} '
                f'PKR {order.cash_amount}'
            )

        total = orders.aggregate(total=Sum('cash_amount'))['total'] or 0
        self.stdout.write(self.style.SUCCESS(
            f'{orders.count()} unverified online payment(s), PKR {total} in total.'
        ))
